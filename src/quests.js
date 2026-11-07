// Het verhaal: "Ein daag in Gulpe". Alle opdrachten en dialogen staan hier.
//
// Let op: echte personen laten we bewust weg. De mensen in de zaken zijn verzonnen
// rollen ("de monteur", "de waard"). De nachtburgemeester is een verzonnen figuur.
// Limburgse zinnetjes zijn een eerste poging en moeten door een echte Gulpenaar
// gecontroleerd worden.

import * as THREE from 'three';
import { makeCharacter, makeKeg } from './character.js';

export class Quests {
  constructor(game) {
    this.g = game;
    this.stage = 'intro';
    this.npcs = {};
    this.coins = [];
    this.flags = {};
  }

  setup() {
    const g = this.g;
    const poi = (id) => g.world.meta.pois.find((p) => p.id === id);
    const spot = (id) => g.world.spotNear(...poi(id).pos);

    this.npcs.monteur = g.addNpc('De monteur', spot('jefabels'),
      makeCharacter({ shirt: 0x2b2b2b, pants: 0x2b3a4a, apron: 0x5a3b22, hair: 0x2a2a2a, hat: 'cap', hatColor: 0x1e88e5 }));
    this.npcs.frituur = g.addNpc('Achter de toonbank', spot('anpiet'),
      makeCharacter({ shirt: 0xffffff, pants: 0x333333, apron: 0xd32f2f, hair: 0x7a5230, hat: 'chef' }));
    this.npcs.concierge = g.addNpc('De conciërge', spot('sophianum'),
      makeCharacter({ shirt: 0x546e7a, pants: 0x37474f, hair: 0x9e9e9e }));
    this.npcs.brouwer = g.addNpc('De brouwer', spot('brouwerij'),
      makeCharacter({ shirt: 0x0f5132, pants: 0x2e2e2e, apron: 0x8d6e63, hair: 0x5d4037 }));
    this.npcs.waard = g.addNpc('De waard', spot('zwarteruiter'),
      makeCharacter({ shirt: 0x111111, pants: 0x222222, apron: 0xf5f5f5, hair: 0x3e2723 }));

    // start en route van de skatewedstrijd op de Ringweg
    this.racePath = g.world.streetPath('Ringweg');
    if (this.racePath.length) {
      const r = poi('ringweg').pos;
      const d0 = Math.hypot(this.racePath[0][0] - r[0], this.racePath[0][1] - r[1]);
      const d1 = Math.hypot(this.racePath.at(-1)[0] - r[0], this.racePath.at(-1)[1] - r[1]);
      if (d1 < d0) this.racePath.reverse();
      this.npcs.skater = g.addNpc('Skater', g.world.resolve(this.racePath[0][0] + 2, this.racePath[0][1] + 2, 0.5),
        makeCharacter({ shirt: 0x8e24aa, pants: 0x1a1a1a, hair: 0xffca28, hat: 'cap', hatColor: 0x111111 }));
    }

    // de nachtburgemeester verschijnt pas 's avonds op de Markt
    const markt = g.world.spotNear(14, 18);
    this.npcs.nacht = g.addNpc('De Nachtburgemeester', markt,
      makeCharacter({ shirt: 0x1a1a40, pants: 0x101020, hair: 0xdddddd, hat: 'tophat', chain: true, sash: 0xc62828 }));
    this.npcs.nacht.group.visible = false;
    this.npcs.nacht.enabled = false;

    this.go('intro');
  }

  // ------------------------------------------------------------ verloop

  async go(stage) {
    const g = this.g;
    this.stage = stage;
    Object.values(this.npcs).forEach((n) => (n.active = false));
    g.setTarget(null);

    switch (stage) {
      case 'intro':
        g.setTarget(this.npcs.monteur);
        g.ui.setQuest('Lekke band', 'Je fiets heeft een lekke band. Breng hem naar Jef Abels Bikes aan de Rijksweg.');
        this.npcs.monteur.active = true;
        break;
      case 'friet':
        g.ui.setQuest('Honger!', 'Tijd voor een frikandel speciaal bij Friture An + Piet, bij het busstation.');
        g.setTarget(this.npcs.frituur);
        this.npcs.frituur.active = true;
        break;
      case 'coins':
        g.ui.setQuest('Alleen contant', 'Pinnen gaat niet. Zoek losse munten in de buurt van de Rijksweg.', '0 / 4 munten');
        this.spawnCoins();
        break;
      case 'coinsBack':
        g.ui.setQuest('Alleen contant', 'Je hebt genoeg muntgeld. Terug naar de friture!', '4 / 4 munten');
        g.setTarget(this.npcs.frituur);
        this.npcs.frituur.active = true;
        break;
      case 'school':
        g.ui.setQuest('In beslag genomen', 'Je skateboard ligt nog bij de conciërge van het Sophianum. Haal hem op.');
        g.setTarget(this.npcs.concierge);
        this.npcs.concierge.active = true;
        break;
      case 'race':
        g.ui.setQuest('Ringweg Race', 'Daag de skaters uit op de Ringweg. Wie is het snelst?');
        if (this.npcs.skater) { g.setTarget(this.npcs.skater); this.npcs.skater.active = true; }
        break;
      case 'brouwerij':
        g.ui.setQuest('Vers van \'t vat', 'De Zwarte Ruiter heeft bijna geen bier meer. Haal een vat op bij de Gulpener Bierbrouwerij.');
        g.setTarget(this.npcs.brouwer);
        this.npcs.brouwer.active = true;
        break;
      case 'bezorgen':
        g.ui.setQuest('Vers van \'t vat', 'Breng het vat naar Herberg De Zwarte Ruiter op de Markt. Zwaar hè!');
        g.setTarget(this.npcs.waard);
        this.npcs.waard.active = true;
        break;
      case 'nacht':
        g.ui.setQuest('De Nachtburgemeester', 'Er staat iemand met een hoge hoed bij de Markt. Ga eens kijken.');
        this.npcs.nacht.group.visible = true;
        this.npcs.nacht.enabled = true;
        this.npcs.nacht.active = true;
        g.setTarget(this.npcs.nacht);
        break;
      case 'keten':
        g.ui.setQuest('De ambtsketen', 'De Nachtburgemeester is zijn ambtsketen kwijt, bij een bruggetje over de Gulp. Zoek hem!');
        this.spawnChain();
        break;
      case 'ketenBack':
        g.ui.setQuest('De ambtsketen', 'Gevonden! Breng de keten terug naar de Nachtburgemeester bij de Markt.');
        this.npcs.nacht.active = true;
        g.setTarget(this.npcs.nacht);
        break;
      case 'vrij':
        g.ui.setQuest('Gulpen is van jou', 'Alle opdrachten gedaan. Loop, fiets of skate vrij rond door het dorp.');
        break;
    }
  }

  // wordt aangeroepen als de speler met een actieve NPC praat
  async talk(npc) {
    const g = this.g;
    const ui = g.ui;
    const N = npc.name;
    g.player.lockedFor = true;
    npc.lookAtPlayer = true;
    try {
      switch (npc) {
        case this.npcs.monteur: {
          await ui.dialog(N, [
            'Hoi! Laat eens kijken... Ja hoor, dat is een flinke lekke band.',
            'Die Gulperberg op en af met zachte banden, dat houdt geen band lang vol hè.',
            'Momentje... plakken, oppompen... klaar! Hij rijdt weer als een zonnetje.',
          ]);
          g.unlockVehicle('bike');
          ui.toast('Fiets gerepareerd!');
          await ui.dialog('Tip', [g.input.isTouch ? 'Tik op de knop "Fiets" om op te stappen.' : 'Druk op F om op je fiets te stappen.']);
          this.go('friet');
          break;
        }
        case this.npcs.frituur: {
          if (this.stage === 'friet') {
            await ui.dialog(N, [
              'Goeiendag! Wat mag het zijn?',
              { name: 'Jij', text: 'Een frikandel speciaal graag. Kan ik pinnen?' },
              'Pinnen? Nee hoor, hier is het alleen contant. Al sinds jaar en dag!',
            ]);
            this.go('coins');
          } else if (this.stage === 'coinsBack') {
            await ui.dialog(N, [
              'Ah, met gepast geld zelfs. Mooi zo!',
              'Eén frikandel speciaal: curry, mayo en uitjes. Smakelijk!',
            ]);
            ui.toast('Frikandel speciaal! Je kunt weer even sprinten.');
            g.player.boost = 60;
            this.go('school');
          }
          break;
        }
        case this.npcs.concierge: {
          await ui.dialog(N, [
            'Zo, kom je je skateboard ophalen? Op het schoolplein wordt niet geskatet, dat weet je.',
            'Goed, je krijgt hem terug. Maar eerst even een overhoring. Je bent tenslotte een leerling van het Sophianum!',
          ]);
          const qs = [
            ['Hoe hoog is de top van de Gulperberg ongeveer?', ['156 meter', '322 meter', '96 meter'], 0],
            ['In welke rivier stroomt de Gulp uit, net ten noorden van het dorp?', ['De Maas', 'De Geul', 'De Worm'], 1],
            ['Sinds wanneer wordt er in Gulpen bier gebrouwen door de Gulpener brouwerij?', ['1925', '1875', '1825'], 2],
          ];
          for (const [q, opts, good] of qs) {
            let ok = false;
            while (!ok) {
              const a = await ui.dialog(N, [q], opts);
              ok = a === good;
              if (!ok) await ui.dialog(N, ['Fout! Denk nog maar eens goed na.']);
            }
            await ui.dialog(N, ['Goed zo.']);
          }
          await ui.dialog(N, ['Netjes, alles goed. Hier is je skateboard. En niet op het schoolplein hè!']);
          g.unlockVehicle('skate');
          ui.toast('Skateboard terug!');
          this.go('race');
          break;
        }
        case this.npcs.skater: {
          const again = this.flags.raceTried;
          const a = await ui.dialog(N, again
            ? ['Revanche? Kom maar op!']
            : [
              'Hé, nieuw gezicht op de Ringweg! Wij skaten hier elke zaterdag.',
              'Eén rondje over de Ringweg, langs alle checkpoints. Durf je?',
            ], ['Kom maar op!', 'Straks misschien']);
          if (a === 0) await g.startRace(this.racePath, npc);
          break;
        }
        case this.npcs.brouwer: {
          await ui.dialog(N, [
            'Een vat voor de Zwarte Ruiter? Komt goed.',
            'Hier wordt al sinds 1825 gebrouwen. Deze zomer is de brouwerij helemaal overgenomen door Grolsch, zeggen ze.',
            'Maar wat er in dit vat zit, wordt nog steeds gewoon hier in Gulpen gebrouwen. Daar hoef je niet bang voor te zijn!',
            'Pas op, hij is zwaar. Fietsen en skaten gaat niet met zo\'n vat. Lopen dus!',
          ]);
          g.carryKeg(makeKeg());
          this.go('bezorgen');
          break;
        }
        case this.npcs.waard: {
          if (this.stage !== 'bezorgen') break;
          await ui.dialog(N, [
            'Daar is ie! Precies op tijd, de tap was bijna droog.',
            'Dat verdient een beloning. Ga zitten, ik tap er een voor je.',
          ]);
          g.dropKeg();
          await g.drinkPils();
          await ui.dialog(N, ['Proost! Op Gulpen!']);
          await g.transitionToNight();
          ui.toast('Ein daag in Gulpe: voltooid!', 3500);
          this.go('nacht');
          break;
        }
        case this.npcs.nacht: {
          if (this.stage === 'nacht') {
            await ui.dialog(N, [
              'Goedenavond! Ik ben de Nachtburgemeester van Gulpen. Als de echte burgemeester slaapt, waak ik over het dorp.',
              'Maar ik heb een probleem. Ik ben mijn ambtsketen kwijt! Zonder keten neemt niemand me serieus.',
              'Ik weet zeker dat ik hem nog had bij een bruggetje over de Gulp. Wil je helpen zoeken?',
            ]);
            this.go('keten');
          } else if (this.stage === 'ketenBack') {
            await ui.dialog(N, [
              'Mijn keten! Je bent een held.',
              'Hierbij benoem ik jou officieel tot Ere-Nachtburgemeester van Gulpen. Alaaf!',
            ]);
            ui.toast('Ere-Nachtburgemeester van Gulpen!', 4000);
            this.go('vrij');
          }
          break;
        }
      }
    } finally {
      g.player.lockedFor = false;
      npc.lookAtPlayer = false;
    }
  }

  // ------------------------------------------------------------ verzamelobjecten

  spawnCoins() {
    const g = this.g;
    const center = g.world.meta.pois.find((p) => p.id === 'anpiet').pos;
    const candidates = g.world.segments.filter(([, ax, az]) => {
      const d = Math.hypot(ax - center[0], az - center[1]);
      return d > 50 && d < 260;
    });
    const picked = [];
    let i = 0;
    while (picked.length < 4 && i < 400) {
      const s = candidates[(i * 37 + 11) % candidates.length];
      i++;
      if (!s) break;
      const x = (s[1] + s[3]) / 2, z = (s[2] + s[4]) / 2;
      if (picked.some(([px, pz]) => Math.hypot(px - x, pz - z) < 60)) continue;
      if (g.world.insideBuilding(x, z)) continue;
      picked.push([x, z]);
    }
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.9, roughness: 0.25, emissive: 0x6b4d00, emissiveIntensity: 0.4 });
    this.coins = picked.map(([x, z]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, g.world.heightAt(x, z) + 1, z);
      m.castShadow = true;
      g.scene.add(m);
      const beam = g.makeBeam(x, z, 0xf2c14e);
      return { mesh: m, beam, taken: false };
    });
    g.collectibles = this.coins.map((c) => ({
      pos: c.mesh.position,
      mesh: c.mesh,
      onCollect: () => {
        c.taken = true;
        g.scene.remove(c.mesh, c.beam);
        const n = this.coins.filter((k) => k.taken).length;
        g.ui.setProgress(`${n} / 4 munten`);
        g.ui.toast(['Een euro!', 'Nog een euro!', '50 cent... telt ook!', 'Genoeg!'][n - 1] || 'Munt!', 1500);
        if (n >= 4) { g.collectibles = []; this.go('coinsBack'); }
      },
    }));
    if (this.coins[0]) g.setTarget({ pos: this.coins[0].mesh.position });
  }

  spawnChain() {
    const g = this.g;
    // zoek een brug over de Gulp, niet te dichtbij de Markt
    const bridges = g.world.ground.polys
      .filter(([cls]) => g.world.ground.classes[cls] === 'brug')
      .map(([, rings]) => {
        const r = rings[0];
        let sx = 0, sz = 0;
        for (let i = 0; i < r.length; i += 2) { sx += r[i]; sz += r[i + 1]; }
        return [sx / (r.length / 2), sz / (r.length / 2)];
      })
      .filter(([x, z]) => Math.hypot(x, z) > 80 && Math.hypot(x, z) < 450)
      .sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    const [x, z] = bridges[Math.min(1, bridges.length - 1)] || [120, -60];
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.06, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.2, emissive: 0x7a5a00, emissiveIntensity: 0.8 }),
    );
    chain.position.set(x, g.world.heightAt(x, z) + 1, z);
    g.scene.add(chain);
    const beam = g.makeBeam(x, z, 0xf2c14e);
    g.collectibles = [{
      pos: chain.position, mesh: chain,
      onCollect: () => {
        g.scene.remove(chain, beam);
        g.collectibles = [];
        g.ui.toast('De ambtsketen!');
        this.go('ketenBack');
      },
    }];
    g.setTarget({ pos: chain.position });
  }

  raceFinished(won) {
    this.flags.raceTried = true;
    if (won) {
      this.g.ui.toast('Gewonnen! Koning van de Ringweg!', 3500);
      setTimeout(() => this.go('brouwerij'), 1200);
    } else {
      this.g.ui.toast('Net te langzaam... Praat met de skater voor een revanche.', 3500);
      this.go('race');
    }
  }
}
