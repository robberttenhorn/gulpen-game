// Missies in de bloemenwijk aan de westkant van Gulpen (Akelei, Heggerank, Bosrank, Schuttersveld...).
// Alle personen en de "Mooiste Voortuin"-wedstrijd zijn verzonnen.
import { startHedge, startGnomes, startBBQ } from './skills3.js';

// punt halverwege een straat, een paar meter opzij (in de voortuin of op de stoep)
function streetSpot(g, name, at = 0.5, side = 3.2) {
  const path = g.world.streetPath(name);
  if (!path || path.length < 2) return null;
  let total = 0;
  const seg = [];
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); total += l; }
  let want = total * at;
  for (let i = 0; i < seg.length; i++) {
    if (want > seg[i] && i < seg.length - 1) { want -= seg[i]; continue; }
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const t = seg[i] ? Math.min(1, want / seg[i]) : 0;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const dx = (bx - ax) / (seg[i] || 1), dz = (bz - az) / (seg[i] || 1);
    // eerst de gekozen kant, anders de andere kant, anders midden op straat
    for (const s of [side, -side, side * 0.5, 0]) {
      const px = x - dz * s, pz = z + dx * s;
      if (!g.world.insideBuilding(px, pz) && !g.world.blocked(px, pz)) return g.world.resolve(px, pz, 0.5);
    }
  }
  return null;
}

export function setupWest(m, g, add) {
  const heg = streetSpot(g, 'Heggerank', 0.45, 3.5);
  if (heg) add('heggenman', 'Buurman met de heggenschaar', heg, { shirt: 0x6d8b3a, pants: 0x4e342e, hair: 0xbdbdbd, hat: 'cap', hatColor: 0x33691e, glasses: true });
  const kab = streetSpot(g, 'Akelei', 0.5, 3.2);
  if (kab) add('kabouter', 'Mevrouw van de tuinkabouters', kab, { shirt: 0xf48fb1, pants: 0x5c6bc0, hair: 0xe0e0e0, hairStyle: 'long', female: true });
  const bbq = streetSpot(g, 'Schuttersveld', 0.5, 3.5);
  if (bbq) add('buurtvereniging', 'Voorzitter van de buurtvereniging', bbq, { shirt: 0xffb300, pants: 0x37474f, hair: 0x5d4037, apron: 0xeeeeee, beard: true });
  // verstopplekken voor de kabouters, verspreid door de wijk
  m.gnomeSpots = [
    ['Bosrank', 0.3, 4], ['Wederik', 0.6, -4], ['Sleedoorn', 0.4, 4], ['Maretak', 0.5, -4],
    ['Bolderik', 0.7, 4], ['Aardaker', 0.35, -4], ['Bosrank', 0.85, -4], ['Wederik', 0.15, 4],
  ].map(([n, at, s]) => streetSpot(g, n, at, s)).filter(Boolean);
}

export function westItems(n) {
  return [
    { id: 'heg', npc: n.heggenman, title: 'De strakste heg van de Heggerank', place: 'Heggerank', desc: 'De jury van de Mooiste Voortuin komt eraan. Knip de heg kaarsrecht langs de lijn.' },
    { id: 'kabouters', npc: n.kabouter, title: 'Kabouters ontvoerd', place: 'Akelei', desc: 'Vijf tuinkabouters zijn verstopt in de bloemenwijk. Zoek ze met de warm-koudmeter.' },
    { id: 'bbq', npc: n.buurtvereniging, title: 'Burendag-BBQ', place: 'Schuttersveld', desc: 'De barbecuemeester is zoek. Draai de burgers op tijd om en serveer de hele straat.' },
  ].filter((x) => x.npc);
}

export const WEST_MISSION_OF = { heggenman: 'heg', kabouter: 'kabouters', buurtvereniging: 'bbq' };

export const westHandlers = {
  // ------------------------------------------------------------ heg knippen
  async heggenman(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Morgen komt de jury van de Mooiste Voortuin van de Bloemenwijk. Ik woon aan de Heggerank. Dan móét je de mooiste heg hebben, toch?',
      'Mijn buurman heeft de zijne met een laserlijn geknipt. Een laserlijn! Ik heb alleen deze schaar en een trillende hand.',
      'Kun jij me helpen? Eén strak lijntje, meer vraag ik niet.',
    ], ['Geef die schaar maar', 'Ik hou van wilde tuinen']);
    if (a !== 0) { await ui.dialog(N, ['Wilde tuinen. Ja. Dat zeggen mensen die nooit snoeien. Je bent gewoon lui, jong.']); return; }
    this.setActive('heg', 'De strakste heg van de Heggerank', 'Hou de heggenschaar op de witte lijn. Minstens 70 procent netjes in 24 seconden.', '');
    const r = await startHedge(g, { time: 24, need: 0.7 });
    if (!r || this.active?.id !== 'heg') return;
    const pct = Math.round(r.pct * 100);
    if (r.ok) {
      await ui.dialog(N, [
        pct >= 90 ? `${pct} procent strak! Die van de buurman lijkt nu wel een bos broccoli.` : `${pct} procent netjes. Hier en daar een deukje, maar dat noemen we "karakter".`,
        'Die jury valt flauw van bewondering. En de buurman valt flauw van jaloezie. Twee vliegen in één klap!',
      ]);
      g.fx?.confetti(g.player.x, g.world.groundAt(g.player.x, g.player.z) + 2, g.player.z, 80);
      this.complete('heg', 'Heg als een liniaal!');
    } else {
      await ui.dialog(N, [`${pct} procent... Het lijkt alsof er een geit doorheen is gelopen. De ontsnapte geit van de boer misschien? Nog een keer!`]);
      this.fail('Heg te scheef geknipt.');
    }
  },

  // ------------------------------------------------------------ kabouterjacht
  async kabouter(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Mijn tuinkabouters zijn weg! Alle vijf! Henk, Sjra, Mia, Jo en Kleine Jean-Pierre.',
      'Er lag een briefje: "Wij zijn op wereldreis." Wereldreis! Ze hebben niet eens een paspoort. Ik denk dat ze gewoon ergens in de wijk staan.',
      'Kijk maar naar die meter: hoe warmer, hoe dichterbij. Binnen drie minuten, voordat het donker wordt en ze echt gaan wandelen.',
    ], ['Ik vind ze!', 'Kabouters? Ik ben te oud voor sprookjes']);
    if (a !== 0) { await ui.dialog(N, ['Te oud? Kleine Jean-Pierre is zestig. Hij staat nog elke dag buiten. Jij kunt een voorbeeld aan hem nemen.']); return; }
    const pool = (this.gnomeSpots || []).slice();
    // kies vijf verschillende plekken
    const spots = [];
    while (pool.length && spots.length < 5) spots.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (spots.length < 3) { await ui.dialog(N, ['Hm, ik zie ze nergens. Kom later nog eens terug.']); return; }
    this.setActive('kabouters', 'Kabouters ontvoerd', 'Loop, fiets of skate door de bloemenwijk. De meter zegt warm of koud. Loop tegen een kabouter aan om hem te pakken.', `0 / ${spots.length} kabouters`);
    const r = await startGnomes(g, spots, { limit: 180 });
    if (!r || this.active?.id !== 'kabouters') return;
    if (r.ok) {
      await ui.dialog(N, [
        `Alle ${r.found}! In ${Math.round(r.time)} seconden! Henk heeft wel een zonnebrand, zie ik. Wereldreis, pfff.`,
        'Volgend jaar zet ik er een GPS-tracker in. Of een slot. Of ik neem gewoon een kat, die loopt tenminste vanzelf terug.',
      ]);
      this.complete('kabouters', 'Kabouterredder van de bloemenwijk!');
    } else {
      await ui.dialog(N, [`${r.found} gevonden... De rest is nu echt op wereldreis. Ik krijg vast een ansichtkaart uit Valkenburg.`]);
      this.fail('Niet alle kabouters gevonden.');
    }
  },

  // ------------------------------------------------------------ burendag-BBQ
  async buurtvereniging(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Het is burendag op het Schuttersveld en onze barbecuemeester is zoek. Hij ging "even" kolen halen. Twee uur geleden.',
      'De hele straat staat met een leeg bordje te wachten. En hongerige buren zijn gevaarlijker dan een schutterij zonder bier.',
      'Draai de burgers om als ze goudbruin zijn, en serveer ze als de andere kant ook klaar is. Acht burgers, en verbrand er niet meer dan twee.',
    ], ['Schort aan, ik grill!', 'Ik eet alleen vegaburgers']);
    if (a !== 0) { await ui.dialog(N, ['Vegaburgers? Die liggen hier ook, maar die heeft de hond al opgegeten. Zelfs de hond twijfelde.']); return; }
    this.setActive('bbq', 'Burendag-BBQ', 'Tik op een burger als de balk groen is om hem om te draaien, en nog eens om op te dienen. Acht burgers, hooguit twee verbrand.', '');
    const r = await startBBQ(g, { need: 8, maxBurnt: 3, limit: 60 });
    if (!r || this.active?.id !== 'bbq') return;
    if (r.ok) {
      await ui.dialog(N, [
        r.burnt ? `${r.served} burgers! En die ${r.burnt === 1 ? 'ene zwarte' : 'paar zwarte'} gaven we aan de buurman die altijd zijn auto voor jouw deur parkeert.` : `${r.served} burgers en niks verbrand. Jij bent de nieuwe barbecuemeester van de bloemenwijk!`,
        'O kijk, daar komt de oude barbecuemeester aan. Met kolen. En een kratje. Ik denk dat hij nooit van plan was snel terug te komen.',
      ]);
      g.fx?.confetti(g.player.x, g.world.groundAt(g.player.x, g.player.z) + 2, g.player.z, 120);
      this.complete('bbq', 'Barbecuemeester van de bloemenwijk!');
    } else {
      await ui.dialog(N, ['Het ruikt hier naar een afgebrande frituur. De buren bestellen nu pizza. Volgend jaar beter!']);
      this.fail('Te veel verbrand of te traag.');
    }
  },
};

if (typeof location !== 'undefined' && location.search.includes('dev')) window.__mini3 = { startHedge, startGnomes, startBBQ };
