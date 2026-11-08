// Finale na het afronden van alle missies: uitnodiging naar de Markt, iedereen uit de missies
// verzamelt zich, de waard houdt een toespraak, en dan vuurwerk, muziek en een polonaise.
import { makeCharacter } from './character.js';

const DURATION = 50; // seconden feest na de toespraak

// Uitnodiging: lichtbundel naar de Markt; de finale begint als je daar bent.
export function inviteFinale(m, g) {
  const markt = g.world.spotNear(20, 0);
  m.setActive('finale', 'Feest op de Markt!', 'Je hebt alle missies gedaan! De waard van De Zwarte Ruiter geeft een feest voor je op de Markt. Volg de lichtbundel.', '');
  g.ui.toast('Alle missies gedaan! Er is feest voor je op de Markt.', 3500);
  g.setDestination(markt, 1e9, () => startFinale(m, g, markt), () => {}, { noTimer: true });
}

async function startFinale(m, g, markt) {
  if (m.active?.id !== 'finale') return;
  const ui = g.ui;
  if (g.mode === 'car') g.exitCar();
  g.setMode('walk');
  g.player.lockedFor = true;
  // het wordt avond: vuurwerk zie je beter in het donker
  if (g.night < 0.5) await g.skipTime(21.5);
  if (m.active?.id !== 'finale') return;
  const [cx, cz] = markt;
  const w = g.world;
  // iedereen uit de missies komt naar de Markt (kopieën; de echte personen staan zolang verstopt)
  const hidden = [];
  const people = Object.entries(m.npcs).filter(([k, n]) => k !== 'waard' && n.look && n.group.visible).slice(0, 26);
  const clones = people.map(([, n], i) => {
    hidden.push(n.group);
    n.group.visible = false;
    const a = (i / people.length) * Math.PI * 2;
    const r = 7.5 + (i % 2) * 2;
    const [x, z] = w.resolve(cx + Math.sin(a) * r, cz + Math.cos(a) * r, 0.5);
    const model = makeCharacter(n.look);
    model.position.set(x, w.groundAt(x, z), z);
    model.rotation.y = Math.atan2(cx - x, cz - z);
    g.scene.add(model);
    return { model, x, z, heading: model.rotation.y, joined: false, marker: { done: true } };
  });
  g.followers = clones; // zwaaien tot de polonaise begint
  g.tempMarkers = [];
  g.joinLines = ['Alaaf!', 'Proost!', 'Op de ereburger!', 'Hup, achter je aan!'];
  // de waard komt voor je staan
  const waard = m.npcs.waard;
  const wOld = { x: waard.group.position.x, z: waard.group.position.z, heading: waard.heading };
  const [wx, wz] = w.resolve(g.player.x + Math.sin(g.player.heading) * 2.2, g.player.z + Math.cos(g.player.heading) * 2.2, 0.5);
  waard.group.position.set(wx, w.groundAt(wx, wz), wz);
  waard.lookAtPlayer = true;
  const restore = () => {
    hidden.forEach((h) => { h.visible = true; });
    waard.group.position.set(wOld.x, w.groundAt(wOld.x, wOld.z), wOld.z);
    waard.heading = wOld.heading;
    waard.lookAtPlayer = false;
    g.sfx?.stopMusic();
    g.stopPolonaise();
    g.joinLines = null;
    g.ui.timer(null);
  };
  m.active.cleanup = restore;
  g.sfx?.play('cheer');
  await ui.dialog(waard.name, [
    'Daar is ie! Iedereen, even stil! Dit is degene die heel Gullepe heeft geholpen.',
    'Muizen gevangen bij Pijls, de geit teruggebracht, het matras officieel gemaakt, kabouters gered, de tuin aan de Groeneweg opgehoogd... en ga zo maar door.',
    'Daarom ben jij vanaf vandaag Ereburger van Gullepe!',
    'Muziek! Vuurwerk! En een rondje pils van de zaak! Iedereen achter de ereburger aan: polonaise!',
  ]);
  if (m.active?.id !== 'finale') return;
  // feest: muziek, vuurwerk en iedereen in de polonaise
  g.player.lockedFor = false;
  g.sfx?.startMusic();
  clones.forEach((c) => { c.joined = true; });
  g.fx.confetti(g.player.x, w.groundAt(g.player.x, g.player.z) + 3, g.player.z, 220);
  m.progress('Loop met de polonaise over de Markt en kijk naar het vuurwerk');
  await new Promise((resolve) => {
    let t = 0, next = 0.3;
    g.minigame = {
      stop: () => { g.minigame = null; resolve(false); },
      update: (dt) => {
        t += dt; next -= dt;
        g.player.lockedFor = false;
        if (g.mode !== 'walk') g.setMode('walk');
        g.ui.timer(`${Math.max(0, Math.ceil(DURATION - t))} s`);
        if (next <= 0 && t < DURATION - 3) {
          next = 0.45 + Math.random() * 0.9;
          const n = Math.random() < 0.25 ? 3 : 1; // af en toe een salvo
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
            const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
            g.fx.firework(x, w.groundAt(x, z) + 1, z, null, () => g.sfx?.play('boom'));
          }
          g.sfx?.play('launch');
        }
        if (t >= DURATION) { g.minigame = null; resolve(true); }
      },
      debug: { label: null, get t() { return t; } },
    };
  });
  if (m.active?.id !== 'finale') return;
  restore();
  m.active.cleanup = null;
  await ui.dialog(waard.name, [
    'Wat een feest! Heel Gullepe praat er nog jaren over.',
    'Je kunt alle missies opnieuw spelen. Op de kaart zie je je beste tijd of score. Kijk of je die nog kunt verbeteren!',
  ]);
  m.complete('finale', 'Ereburger van Gullepe!');
}
