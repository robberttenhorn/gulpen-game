// TikTok-missie bij Cafetaria Zheng: een POV-filmpje opnemen van het klaarmaken van een bestelling.
// Vijf stappen, telkens op het goede moment tikken. Hoe strakker, hoe meer views.
import * as THREE from 'three';

const COLORS = { raw: new THREE.Color(0xf3e2a0), gold: new THREE.Color(0xe8a53a), burnt: new THREE.Color(0x4a2a10) };
const SAUCE = { mayo: [0xfff4cf], curry: [0xb3261e], pinda: [0x7a4a1e] };

export const ORDERS = [
  { text: 'Patatje oorlog met een frikandel', snack: 'frikandel', sauces: ['mayo', 'pinda'], sauceName: 'oorlog' },
  { text: 'Friet speciaal met een kroket', snack: 'kroket', sauces: ['mayo', 'curry'], sauceName: 'speciaal' },
  { text: 'Friet mayo met een bamischijf', snack: 'bamischijf', sauces: ['mayo'], sauceName: 'mayo' },
];

const COMMENTS = {
  perfect: ['Dit is kunst 🔥', 'Goudbruin!! 😍', 'Gulpe represent', 'Die friet 10/10', 'Wanneer komen jullie naar Maastricht?', 'Alaaf! 🍟', 'Joa, dit wil ich!', 'Chef kiss 🤌'],
  good: ['Netjes', 'Ziet er lekker uit', 'Ik krijg honger', 'Waar is dit?', 'Ik ga morgen', 'Solide frietje'],
  miss: ['Verbrand 💀', 'Bro 😭', 'Hahaha nee', 'Mijn oma doet het beter', 'Is dit een stagiair?', 'Dit is mijn hele jaar'],
  fail: ['FAIL VAN HET JAAR 😂', 'Ik kan niet meer 😭😭', 'Deze gaat viraal', 'Nog een keer!!', 'Sterkte met dweilen'],
  upload: ['Hoe vaak heb ik dit nu gekeken', 'Gulpen op de kaart!', 'Wie is hier van de FYP?', 'Ik woon hier om de hoek', 'Tag een Gulpenaar', 'Dit is waarom ik van Limburg hou'],
};

export function formatViews(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace('.', ',') + 'K';
  return String(Math.round(v));
}

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
}

// Start de opname. Geeft { views, results } terug, of null als de klus gestopt is.
export function runTikTok(g, room, order) {
  const tt = room.tt;
  const loc = (x, y, z) => new THREE.Vector3(room.ox + x, y, room.oz + z);
  let stopped = false;

  // --- beeldlaag zoals in de app ---
  const ov = el('div', 'tt-overlay');
  ov.innerHTML = `
    <div class="tt-top"><span class="tt-rec"><span class="tt-dot"></span>REC <span class="tt-time">0:00</span></span><span class="tt-views"><b>0</b> views</span></div>
    <div class="tt-pov">POV: je maakt een bestelling klaar bij de beste cafetaria van Gulpe</div>
    <div class="tt-side"><div class="tt-ico">❤️<small class="tt-likes">0</small></div><div class="tt-ico">💬<small class="tt-ncom">0</small></div><div class="tt-ico">↗<small>Delen</small></div></div>
    <div class="tt-comments"></div>
    <div class="tt-task"><div class="tt-step"></div><div class="tt-hint"></div>
      <div class="tt-bar"><div class="tt-zone"></div><div class="tt-perfect"></div><div class="tt-needle"></div></div>
      <div class="tt-mash"><div class="tt-mash-fill"></div></div>
    </div>
    <div class="tt-order"><small>Bon</small>${order.text}</div>
    <button class="tt-stop" type="button">Stoppen</button>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  const $ = (s) => ov.querySelector(s);
  // tikken op het scherm telt als actie
  ov.addEventListener('pointerdown', (e) => { if (!e.target.closest('.tt-stop')) g.input.actionPressed = true; });
  $('.tt-stop').addEventListener('click', () => g.missions.stop());

  let views = 800 + Math.random() * 400, shownViews = 0, likes = 0, ncom = 0, recT = 0;
  const comment = (kind, n = 1) => {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (stopped) return;
        const list = COMMENTS[kind];
        const c = el('div', 'tt-c', `<b>@${['gulpe_fan', 'friet4life', 'limburgsjeng', 'geul_girl', 'heuvelland_hans', 'vastelaovend', 'xx.mergel.xx', 'pilske_pls'][Math.floor(Math.random() * 8)]}</b> ${list[Math.floor(Math.random() * list.length)]}`);
        $('.tt-comments').append(c);
        while ($('.tt-comments').children.length > 3) $('.tt-comments').firstChild.remove();
        ncom++;
      }, i * 450);
    }
  };
  const heart = () => {
    const h = el('div', 'tt-heart', '❤️');
    h.style.right = `${14 + Math.random() * 40}px`;
    ov.append(h);
    setTimeout(() => h.remove(), 1600);
  };

  // --- camera in 'jouw hoofd' ---
  const shot = (pos, look) => { g.pov = { pos: loc(...pos), look: loc(...look) }; };
  g.player.group.visible = false;
  const fry = [-2.75, 1.85, -1.85], fryLook = [-2.45, 1.02, -3.05];
  const tray = [1.4, 1.75, -1.75], trayLook = [1.4, 0.98, -2.95];
  shot(fry, fryLook);
  // meteen 'knip' naar de keuken
  g.camera.position.copy(g.pov.pos);
  g.povLook = g.pov.look.clone();
  g.minigame = { stop: () => { stopped = true; }, update: (dt) => anim(dt) };

  // --- kleine animaties ---
  let bubbling = 0;
  const anim = (dt) => {
    recT += dt;
    const m = Math.floor(recT / 60), s = Math.floor(recT % 60);
    const te = $('.tt-time');
    if (te) te.textContent = `${m}:${String(s).padStart(2, '0')}`;
    shownViews += (views - shownViews) * Math.min(1, dt * 3);
    $('.tt-views b').textContent = formatViews(shownViews);
    $('.tt-likes').textContent = formatViews(likes);
    $('.tt-ncom').textContent = formatViews(ncom);
    for (const b of tt.bubbles) {
      b.visible = bubbling > 0;
      if (!b.visible) continue;
      b.userData.t += dt * (0.8 + bubbling);
      if (b.userData.t > 1) b.userData.t = 0;
      const x = b.userData.pool ? -2.05 : -2.75;
      b.position.set(x + Math.sin(b.id * 7.1) * 0.22, 1.035 + Math.sin(b.userData.t * Math.PI) * 0.02, -3.05 + Math.cos(b.id * 3.3) * 0.2);
    }
  };

  // Eén stap: update(dt, pressed) geeft een resultaat terug zodra de stap klaar is.
  const step = (title, hint, setup, update) => new Promise((resolve) => {
    $('.tt-step').textContent = title;
    $('.tt-hint').textContent = hint;
    setup?.();
    g.input.consumeAction(); g.input.spacePressed = false; // geen oude tik meenemen
    g.ui.setActionLabel('Tik!');
    g.minigame = {
      actionLabel: 'Tik!',
      stop: () => { stopped = true; resolve(null); },
      update: (dt) => {
        g.player.lockedFor = true;
        anim(dt);
        const pressed = g.input.consumeAction() || g.input.spacePressed;
        g.input.spacePressed = false;
        const r = update(dt, pressed);
        if (r) { g.minigame = { stop: () => { stopped = true; resolve(null); }, update: (d) => anim(d) }; resolve(r); }
      },
    };
  });
  const bar = (mode, zone, perfect) => {
    $('.tt-bar').style.display = mode === 'bar' ? 'block' : 'none';
    $('.tt-mash').style.display = mode === 'mash' ? 'block' : 'none';
    if (zone) Object.assign($('.tt-zone').style, { left: zone[0] * 100 + '%', width: (zone[1] - zone[0]) * 100 + '%' });
    if (perfect) Object.assign($('.tt-perfect').style, { left: perfect[0] * 100 + '%', width: (perfect[1] - perfect[0]) * 100 + '%' });
  };
  const judge = (v, zone, perfect) => (v >= perfect[0] && v <= perfect[1] ? 'perfect' : v >= zone[0] && v <= zone[1] ? 'good' : 'miss');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const score = (res, labels) => {
    const f = { perfect: 2.2, good: 1.45, miss: 0.85, fail: 1.7 }[res];
    views *= f;
    likes += views * (res === 'perfect' ? 0.12 : 0.05);
    comment(res, res === 'perfect' ? 3 : 2);
    for (let i = 0; i < (res === 'perfect' ? 6 : res === 'good' ? 3 : 1); i++) setTimeout(heart, i * 180);
    // flits en een trilling bij een misser, zodat je direct ziet hoe het ging
    const fx = el('div', 'fx-flash ' + (res === 'perfect' ? 'gold' : res === 'good' ? 'good' : 'bad'));
    ov.append(fx); setTimeout(() => fx.remove(), 380);
    if (res === 'miss' || res === 'fail') { const tk = ov.querySelector('.tt-task'); tk.classList.remove('fx-shake-strong'); void tk.offsetWidth; tk.classList.add('fx-shake-strong'); }
    const fl = el('div', 'tt-flash ' + res, labels[res]);
    ov.append(fl);
    setTimeout(() => fl.remove(), 1400);
    g.sfx?.play(res === 'miss' ? 'splat' : res === 'fail' ? 'crash' : 'pop');
  };

  const run = async () => {
    const results = [];
    g.sfx?.play('camera');
    await wait(900);
    if (stopped) return null;

    // 1. friet bakken tot goudbruin
    {
      const zone = [0.55, 0.8], perfect = [0.63, 0.72];
      let p = 0;
      const res = await step('1/5 Friet bakken', 'Tik als de friet goudbruin is!', () => { bar('bar', zone, perfect); tt.basketA.position.y = 1.0; bubbling = 1; }, (dt, pressed) => {
        p += dt / 4.2;
        $('.tt-needle').style.left = Math.min(1, p) * 100 + '%';
        tt.fryMat.color.copy(p < 0.67 ? COLORS.raw.clone().lerp(COLORS.gold, p / 0.67) : COLORS.gold.clone().lerp(COLORS.burnt, (p - 0.67) / 0.33));
        if (pressed) return judge(p, zone, perfect);
        if (p >= 1) return 'miss';
        return null;
      });
      if (!res) return null;
      tt.basketA.position.y = 1.22; bubbling = 0;
      score(res, { perfect: 'Goudbruin!', good: 'Prima frietje', miss: p >= 1 ? 'Verbrand...' : 'Nog niet gaar...' });
      results.push(res);
      await wait(900);
    }
    if (stopped) return null;

    // 2. de snack in het vet
    {
      const zone = [0.6, 0.82], perfect = [0.68, 0.76];
      const snack = tt.snacks[order.snack];
      Object.values(tt.snacks).forEach((m) => { m.visible = m === snack; });
      let p = 0;
      const res = await step(`2/5 ${order.snack[0].toUpperCase() + order.snack.slice(1)} frituren`, 'Tik als hij knapperig bruin is!', () => { bar('bar', zone, perfect); tt.basketB.position.y = 1.0; bubbling = 1.4; tt.snackMat.color.setHex(0xc89a5a); }, (dt, pressed) => {
        p += dt / 2.8;
        $('.tt-needle').style.left = Math.min(1, p) * 100 + '%';
        tt.snackMat.color.setHex(0xc89a5a).lerp(new THREE.Color(0x3a1e0a), Math.max(0, p - 0.2) * 0.9);
        if (pressed) return judge(p, zone, perfect);
        if (p >= 1) return 'miss';
        return null;
      });
      if (!res) return null;
      tt.basketB.position.y = 1.22; bubbling = 0;
      score(res, { perfect: 'Knapperig!', good: 'Mooi zo', miss: 'Oei, die is zwart' });
      results.push(res);
      await wait(900);
    }
    if (stopped) return null;

    // 3. mandje schudden
    {
      let t = 0, n = 0;
      const res = await step('3/5 Mandje schudden', 'Tik zo snel als je kunt!', () => bar('mash'), (dt, pressed) => {
        t += dt;
        if (pressed) { n++; tt.basketA.rotation.x = (n % 2 ? 1 : -1) * 0.25; g.sfx?.play('cart'); }
        tt.basketA.rotation.x *= 0.85;
        $('.tt-mash-fill').style.width = Math.min(100, (n / 14) * 100) + '%';
        $('.tt-hint').textContent = `Tik zo snel als je kunt! ${Math.max(0, 3 - t).toFixed(1)} s`;
        if (t >= 3) return n >= 14 ? 'perfect' : n >= 8 ? 'good' : 'miss';
        return null;
      });
      if (!res) return null;
      tt.basketA.rotation.x = 0;
      score(res, { perfect: 'Schudden als een pro!', good: 'Goed geschud', miss: 'Slap geschud...' });
      results.push(res);
    }
    if (stopped) return null;

    // naar de sausbar: friet en snack in het bakje
    shot(tray, trayLook);
    tt.fries.visible = false;
    tt.trayFries.visible = true;
    tt.traySnack.clear();
    const sn = tt.snacks[order.snack].clone();
    sn.material = tt.snackMat;
    sn.visible = true;
    tt.traySnack.add(sn);
    tt.trayFries.traverse((o) => { if (o.isMesh) o.material = tt.fryMat; });
    await wait(1000);
    if (stopped) return null;

    // 4. saus spuiten en op tijd stoppen
    {
      const zone = [0.7, 0.95], perfect = [0.8, 0.9];
      let f = 0;
      tt.sauce.clear();
      const blobs = order.sauces.map((k, i) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: SAUCE[k][0], roughness: 0.3 }));
        b.position.x = i * 0.07;
        b.scale.setScalar(0.01);
        tt.sauce.add(b);
        return b;
      });
      const bottle = tt.bottles[order.sauces[0]];
      const home = bottle.position.clone();
      const res = await step(`4/5 Saus: ${order.sauceName}`, 'Stop met spuiten als de klodder precies goed is!', () => {
        bar('bar', zone, perfect);
        bottle.position.set(1.36, 1.3, -2.95); bottle.rotation.x = Math.PI;
      }, (dt, pressed) => {
        f += dt / 2.4;
        $('.tt-needle').style.left = Math.min(1, f / 1.15) * 100 + '%';
        blobs.forEach((b) => { b.scale.set(0.3 + f, 0.2 + f * 0.6, 0.3 + f); });
        bottle.scale.x = 1 - Math.sin(f * 30) * 0.05;
        if (pressed) return judge(f / 1.15, zone, perfect);
        if (f >= 1.15) return 'miss';
        return null;
      });
      bottle.position.copy(home); bottle.rotation.x = 0; bottle.scale.x = 1;
      if (!res) return null;
      score(res, { perfect: 'Perfecte klodder!', good: 'Lekker', miss: f >= 1.15 ? 'Sausoverstroming!' : 'Beetje karig...' });
      results.push(res);
      await wait(900);
    }
    if (stopped) return null;

    // 5. het trucje: bakje opgooien en opvangen
    {
      const zone = [0.4, 0.6], perfect = [0.46, 0.54];
      let t = 0;
      shot([1.4, 1.5, -0.9], [1.4, 1.6, -2.9]);
      const trayY = tt.tray.position.y;
      const res = await step('5/5 Het trucje', 'Gooi het bakje op en vang het: tik als het in het midden is!', () => bar('bar', zone, perfect), (dt, pressed) => {
        t += dt;
        const v = (Math.sin(t * 5.2 - Math.PI / 2) + 1) / 2; // heen en weer
        $('.tt-needle').style.left = v * 100 + '%';
        tt.tray.position.y = trayY + 0.6 + Math.sin(t * 2.6) * 0.5 + 0.5;
        tt.tray.rotation.z += dt * 6;
        if (pressed) return judge(v, zone, perfect);
        if (t > 6) return 'miss';
        return null;
      });
      if (!res) return null;
      if (res === 'miss') {
        // bakje valt: friet over de vloer (faalfilmpjes doen het ook goed)
        for (let k = 0; k < 20; k++) {
          const yv = 0.3 + Math.random() * 0.3;
          tt.tray.position.y = Math.max(0.05, tt.tray.position.y - yv);
          await wait(25);
        }
        tt.tray.rotation.set(0, 0, Math.PI);
        score('fail', { fail: 'Hij valt! Faalfilmpje...' });
        results.push('fail');
      } else {
        tt.tray.rotation.set(0, 0, 0);
        tt.tray.position.y = trayY;
        score(res, { perfect: 'Gevangen! Wat een trucje!', good: 'Net op tijd!' });
        results.push(res);
      }
      await wait(1200);
    }
    if (stopped) return null;

    // uploaden: het algoritme doet de rest
    $('.tt-task').style.display = 'none';
    $('.tt-rec').innerHTML = '⬆ Uploaden... <span class="tt-time"></span>';
    g.ui.setActionLabel(null);
    const boost = 2.5 + Math.random() * 2.5;
    const target = views * boost;
    const t0 = performance.now();
    await new Promise((resolve) => {
      g.minigame = {
        stop: () => { stopped = true; resolve(); },
        update: (dt) => {
          const k = Math.min(1, (performance.now() - t0) / 4500);
          views = views + (target - views) * Math.min(1, dt * 1.6);
          likes = views * 0.09;
          anim(dt);
          if (Math.random() < dt * 2.5) comment('upload');
          if (Math.random() < dt * 4) heart();
          if (k >= 1) resolve();
        },
      };
    });
    if (stopped) return null;
    views = target;
    return { views, results };
  };

  const cleanup = () => {
    ov.remove();
    document.body.classList.remove('pov');
    g.pov = null;
    g.player.group.visible = true;
    g.minigame = null;
    g.player.lockedFor = false;
    bubbling = 0;
    tt.bubbles.forEach((b) => { b.visible = false; });
    // keuken weer klaarzetten voor een volgende keer
    tt.fries.visible = true;
    tt.trayFries.visible = false;
    tt.traySnack.clear();
    tt.sauce.clear();
    tt.fryMat.color.copy(COLORS.raw);
    tt.tray.position.set(1.4, 0.94, -2.95);
    tt.tray.rotation.set(0, 0, 0);
    tt.basketA.position.y = tt.basketB.position.y = 1.22;
    Object.values(tt.snacks).forEach((m) => { m.visible = false; });
  };

  return run().then((r) => { cleanup(); return r; }, (e) => { cleanup(); throw e; });
}
