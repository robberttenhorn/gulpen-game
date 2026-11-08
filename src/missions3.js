// Missies in de bloemenwijk aan de westkant van Gulpen (Akelei, Heggerank, Bosrank, Aardaker...).
// Alle personen en de "Mooiste Voortuin"-wedstrijd zijn verzonnen.
import * as THREE from 'three';
import { startHedge, startGnomes, startBBQ, startBarrow } from './skills3.js';
import { makeKruiwagen, makeSchep } from './props.js';

// Aardaker 43 (PDOK Locatieserver, RD 189534.701 314005.2) in spelcoördinaten
const AARDAKER_43 = [189534.701 - 190531, -(314005.2 - 314058)];
// Groeneweg 65 (PDOK Locatieserver, RD 190419.491 314258.471)
const GROENEWEG_65 = [190419.491 - 190531, -(314258.471 - 314058)];

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
  // burendag-BBQ: jongen voor de deur van Aardaker 43, met de barbecue ernaast
  const [bx, bz] = g.world.spotNear(...AARDAKER_43);
  add('bbqjongen', 'Jongen van Aardaker 43', [bx, bz], { shirt: 0xeceff1, pants: 0x37474f, hair: 0xe6c770, jacket: 0x1e63c8 });
  {
    const grill = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.5, metalness: 0.3 });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), black);
    bowl.position.y = 0.78;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), black);
    lid.position.set(0.18, 0.86, 0); lid.rotation.z = -1.1;
    grill.add(bowl, lid);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6), black);
      leg.position.set(Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2);
      leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      grill.add(leg);
    }
    const [gx, gz] = g.world.resolve(bx + 1.4, bz + 0.6, 0.5);
    grill.position.set(gx, g.world.groundAt(gx, gz), gz);
    grill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scene.add(grill);
  }
  // verstopplekken voor de kabouters, verspreid door de wijk
  m.gnomeSpots = [
    ['Bosrank', 0.3, 4], ['Wederik', 0.6, -4], ['Sleedoorn', 0.4, 4], ['Maretak', 0.5, -4],
    ['Bolderik', 0.7, 4], ['Aardaker', 0.35, -4], ['Bosrank', 0.85, -4], ['Wederik', 0.15, 4],
  ].map(([n, at, s]) => streetSpot(g, n, at, s)).filter(Boolean);
}

// Groeneweg 65: krullebol in zijn voortuin, met een berg grond verderop aan de straat
export function setupGroeneweg(m, g, add) {
  const w = g.world;
  const [ax, az] = GROENEWEG_65;
  const st = w.nearestStreet(ax, az, 'Groeneweg');
  if (!st) return;
  // van de straat naar het huis lopen tot aan de gevel; de tuin ligt een paar meter voor de gevel
  const dx = ax - st.x, dz = az - st.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  let fx = st.x, fz = st.z, dist = 0;
  for (let t = 0; t < d; t += 0.25) { const px = st.x + ux * t, pz = st.z + uz * t; if (w.insideBuilding(px, pz)) break; fx = px; fz = pz; dist = t; }
  const back = Math.min(3, dist * 0.4);
  const [gx, gz] = w.resolve(fx - ux * back, fz - uz * back, 0.8);
  m.groenewegDrop = [gx, gz];
  const npcSpot = w.resolve(gx + uz * 1.8, gz - ux * 1.8, 0.5);
  const npc = add('krullebol', 'Krullebol in de tuin', npcSpot, { shirt: 0x8d6e63, pants: 0x3e4a5a, hair: 0x5b3a1e, hairStyle: 'curly', sleeves: 'short', shoes: 0x4e342e });
  g.attachToHand(npc.model, makeSchep(), { offset: [0, -0.55, 0.07] });
  // de voortuin wordt opgehoogd: een laag grond binnen een houten rand, die met elke kruiwagen hoger wordt
  const bed = new THREE.Group();
  const W = 4.2, D = 3.2;
  const plank = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
  for (const [bw, bd, x, z] of [[W + 0.1, 0.06, 0, D / 2], [W + 0.1, 0.06, 0, -D / 2], [0.06, D, W / 2, 0], [0.06, D, -W / 2, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.3, bd), plank);
    b.position.set(x, 0.15, z); b.castShadow = true; b.receiveShadow = true;
    bed.add(b);
  }
  const mound = new THREE.Mesh(new THREE.BoxGeometry(W, 1, D, 6, 1, 5), new THREE.MeshStandardMaterial({ color: 0x3e2a1a, roughness: 1 }));
  mound.scale.y = 0.03; mound.position.y = 0.015; mound.receiveShadow = true;
  // hoogte en positie samen bijwerken (de onderkant blijft op de grond)
  mound.userData.setLevel = (h) => { mound.scale.y = h; mound.position.y = h / 2; };
  bed.add(mound);
  bed.position.set(gx, w.groundAt(gx, gz), gz);
  bed.rotation.y = Math.atan2(ux, uz);
  g.scene.add(bed);
  m.groenewegMound = mound;
  // berg grond aan de straat, ongeveer 20 meter verderop langs de Groeneweg
  const path = w.streetPath('Groeneweg');
  let heap = null;
  if (path && path.length > 1) {
    let bi = 0, bd = Infinity;
    path.forEach(([x, z], i) => { const dd = Math.hypot(x - st.x, z - st.z); if (dd < bd) { bd = dd; bi = i; } });
    for (const dir of [1, -1]) {
      let acc = 0, i = bi;
      while (acc < 20 && path[i + dir]) { acc += Math.hypot(path[i + dir][0] - path[i][0], path[i + dir][1] - path[i][1]); i += dir; }
      if (acc < 14) continue;
      const [px, pz] = path[i];
      // aan de kant van het huis, op de stoeprand
      // liefst naast de rijbaan (stoep, berm of oprit), zodat de auto's er niet doorheen rijden
      const [qx, qz] = path[Math.max(0, Math.min(path.length - 1, i + dir))];
      const tx = qx - px, tz = qz - pz, tl = Math.hypot(tx, tz) || 1;
      const cands = [4.5, -4.5, 6, -6, 3.5, -3.5, 7.5, -7.5].map((off) => [px - (tz / tl) * off, pz + (tx / tl) * off])
        .filter(([hx, hz]) => !w.insideBuilding(hx, hz) && !w.blocked(hx, hz));
      const pick = cands.find(([hx, hz]) => w.classAt(hx, hz) !== 'rijbaan') || cands[0];
      if (pick) heap = w.resolve(pick[0], pick[1], 1.2);
      if (heap) break;
    }
  }
  if (!heap) heap = w.resolve(st.x + uz * 6, st.z - ux * 6, 1.2);
  m.groenewegHeap = heap;
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.1, 16, 2), new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1, flatShading: true }));
  pile.scale.set(1, 1, 0.8);
  pile.position.set(heap[0], w.groundAt(...heap) + 0.5, heap[1]);
  pile.castShadow = true; pile.receiveShadow = true;
  g.scene.add(pile);
  m.groenewegPile = pile;
}

export function westItems(n) {
  return [
    { id: 'heg', npc: n.heggenman, title: 'De strakste heg van de Heggerank', place: 'Heggerank', desc: 'De jury van de Mooiste Voortuin komt eraan. Knip de heg kaarsrecht langs de lijn.' },
    { id: 'kabouters', npc: n.kabouter, title: 'Kabouters ontvoerd', place: 'Akelei', desc: 'Vijf tuinkabouters zijn verstopt in de bloemenwijk. Zoek ze met de warm-koudmeter.' },
    { id: 'bbq', npc: n.bbqjongen, title: 'Burendag-BBQ', place: 'Aardaker 43', desc: 'De barbecuemeester is zoek. Draai de burgers op tijd om en serveer de hele straat.' },
    { id: 'grond', npc: n.krullebol, title: 'Grond sjouwen', place: 'Groeneweg 65', desc: 'Help de krullebol zijn voortuin op te hogen: rij drie kruiwagens grond van de straat naar zijn tuin, zonder te morsen.' },
  ].filter((x) => x.npc);
}

export const WEST_MISSION_OF = { heggenman: 'heg', kabouter: 'kabouters', bbqjongen: 'bbq', krullebol: 'grond' };

export const westHandlers = {
  // ------------------------------------------------------------ Groeneweg 65: grond sjouwen
  async krullebol(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Hé, kom je even helpen? Mijn voortuin moet opgehoogd worden, maar de vrachtwagen heeft de grond verderop aan de straat gestort in plaats van in mijn tuin.',
      'Drie kruiwagens, dan ligt de tuin weer mooi hoog. En niet rennen met die kruiwagen, en niet te scherp de bocht om, anders ligt de helft op straat.',
      'Mijn krullen zitten al vol zand. Pak jij de kruiwagen?',
    ], ['Geef die kruiwagen maar', 'Ik heb net schone schoenen aan']);
    if (a !== 0) { await ui.dialog(N, ['Schone schoenen? Kom maar terug als ze vies mogen worden.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    const heap = this.groenewegHeap, drop = this.groenewegDrop;
    const dist = Math.hypot(heap[0] - drop[0], heap[1] - drop[1]);
    const limit = Math.round(3 * (2 * dist / 3.4 + 3) + 25);
    this.setActive('grond', 'Grond sjouwen', 'Loop naar de berg grond, rij de volle kruiwagen naar de voortuin en kiep hem leeg binnen de houten rand. Drie ritten, dan ligt de tuin hoger. Niet rennen en geen scherpe bochten, anders mors je.', '');
    this.active.noVehicles = true;
    const mound = this.groenewegMound, pile = this.groenewegPile;
    mound.userData.setLevel(0.03); pile.scale.set(1, 1, 0.8); // opnieuw beginnen na een afgebroken poging
    const r = await startBarrow(g, {
      heap, drop, trips: 3, need: 2.1, limit, makeBarrow: makeKruiwagen,
      onDeliver: (total) => {
        // de tuin komt hoger te liggen, de berg aan de straat krimpt
        mound.userData.setLevel(0.03 + total * 0.085);
        pile.scale.set(Math.max(0.35, 1 - total * 0.22), Math.max(0.3, 1 - total * 0.24), Math.max(0.3, 0.8 - total * 0.18));
      },
    });
    if (!r || this.active?.id !== 'grond') return;
    const pct = Math.round((r.delivered / 3) * 100);
    if (r.ok) {
      await ui.dialog(N, [
        pct >= 95 ? 'Alles erin en niks gemorst! De tuin ligt weer mooi hoog. Jij kunt zo bij een hovenier aan de slag.' : `${pct} procent van de grond ligt in de tuin, en hij ligt al een flink stuk hoger. Die paar kluitjes op straat? Die zijn voor de mussen.`,
        'Mijn rug is je eeuwig dankbaar. Mijn krullen ook, er zit nu iets minder zand in.',
      ]);
      g.fx?.confetti(drop[0], g.world.groundAt(...drop) + 2, drop[1], 90);
      this.complete('grond', 'Grondwerker van de Groeneweg!');
    } else {
      await ui.dialog(N, [r.late ? 'De tijd is om, en de berg ligt er nog half. Morgen weer een dag. Of nu meteen nog een keer?' : `Maar ${pct} procent in de tuin? Er ligt meer grond op straat dan in mijn tuin, zo wordt hij nooit hoger. Nog een keer, en dan rustig aan!`]);
      // berg weer vol voor een nieuwe poging
      mound.userData.setLevel(0.03); pile.scale.set(1, 1, 0.8);
      this.fail(r.late ? 'Te laat.' : 'Te veel gemorst.');
    }
  },

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
  async bbqjongen(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Hoi! Vandaag is het burendag en de halve Aardaker komt bij ons barbecueën.',
      'Mijn vader zou grillen, maar hij ging "even" kolen halen. Twee uur geleden. Iedereen staat al met een leeg bordje te wachten.',
      'En hongerige buren zijn gevaarlijker dan een schutterij zonder bier. Draai jij de burgers om als ze goudbruin zijn? Acht burgers, en verbrand er niet meer dan twee.',
    ], ['Schort aan, ik grill!', 'Ik eet alleen vegaburgers']);
    if (a !== 0) { await ui.dialog(N, ['Vegaburgers? Die liggen hier ook, maar die heeft de hond al opgegeten. Zelfs de hond twijfelde.']); return; }
    this.setActive('bbq', 'Burendag-BBQ', 'Tik op een burger als de balk groen is om hem om te draaien, en nog eens om op te dienen. Acht burgers, hooguit twee verbrand.', '');
    const r = await startBBQ(g, { need: 8, maxBurnt: 3, limit: 60 });
    if (!r || this.active?.id !== 'bbq') return;
    if (r.ok) {
      await ui.dialog(N, [
        r.burnt ? `${r.served} burgers! En die ${r.burnt === 1 ? 'ene zwarte' : 'paar zwarte'} gaven we aan de buurman die altijd zijn auto voor jouw deur parkeert.` : `${r.served} burgers en niks verbrand. Jij bent de nieuwe barbecuemeester van de bloemenwijk!`,
        'O kijk, daar komt mijn vader aan. Met kolen. En een kratje bier. Ik denk dat hij nooit van plan was snel terug te komen.',
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
