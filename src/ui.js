// Alles wat over het 3D-beeld heen ligt: dialogen, opdrachtkaart, straatnaambord, minikaart.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(input) {
    this.input = input;
    this.dialogOpen = false;
    this.toastTimer = null;
    this.setupQuestToggle();
    $('dialog').addEventListener('pointerdown', (e) => {
      if (e.target.tagName !== 'BUTTON') this.input.actionPressed = true;
    });
    // vertaling van Gulpense zinnen aan/uit (onthouden per apparaat)
    this.translate = true;
    try { this.translate = localStorage.getItem('gulpe-vertaling') !== 'uit'; } catch { /* geen opslag */ }
    const tr = $('dialog-tr');
    const sync = () => {
      tr.textContent = this.translate ? 'Vertaling aan' : 'Vertaling uit';
      tr.setAttribute('aria-pressed', String(this.translate));
      $('dialog-nl').hidden = !this.translate || !this.currentNl;
    };
    tr.addEventListener('click', (e) => {
      e.stopPropagation();
      this.translate = !this.translate;
      try { localStorage.setItem('gulpe-vertaling', this.translate ? 'aan' : 'uit'); } catch { /* negeren */ }
      sync();
    });
    this.syncTranslation = sync;
  }

  // opdrachtkaartje in- en uitklappen (keuze wordt onthouden)
  setupQuestToggle() {
    const card = $('quest-card'), btn = $('quest-toggle');
    const set = (c) => {
      card.classList.toggle('collapsed', c);
      btn.setAttribute('aria-expanded', String(!c));
      btn.setAttribute('aria-label', c ? 'Missie uitklappen' : 'Missie inklappen');
      try { localStorage.setItem('gulpe-quest-collapsed', c ? '1' : '0'); } catch (e) { /* geen opslag */ }
    };
    let start = false;
    try { start = localStorage.getItem('gulpe-quest-collapsed') === '1'; } catch (e) { /* geen opslag */ }
    set(start);
    const toggle = (e) => { e.stopPropagation(); set(!card.classList.contains('collapsed')); };
    btn.addEventListener('click', toggle);
    $('quest-title').addEventListener('click', toggle);
  }

  setQuest(title, desc, progress = '') {
    // zonder lopende missie geen tekstblok linksboven
    $('quest-card').hidden = !title;
    if (!title) return;
    $('quest-title').textContent = title;
    $('quest-desc').textContent = desc;
    $('quest-progress').textContent = progress;
  }
  setProgress(text) { $('quest-progress').textContent = text; }

  // teller linksboven bij vrij rondlopen: hoeveel missies al afgerond (null = verbergen)
  setTally(done, total) {
    const el = $('mission-tally');
    el.hidden = done == null;
    if (done == null) return;
    const text = `🏆 ${done} / ${total} missies afgerond`;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('all', done >= total);
  }

  setStreet(name) {
    const el = $('street-name');
    if (el.textContent !== name) el.textContent = name;
    $('street-sign').style.opacity = name ? 1 : 0;
  }

  // Gulpens woord met vertaling (als de vertaling aan staat)
  toastDialect(word, nl, ms = 1600) {
    this.toast(this.translate && nl ? `${word} (${nl})` : word, ms);
  }

  toast(text, ms = 2600) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  prompt(text) {
    const el = $('prompt');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = (this.input.isTouch ? '' : '[E] ') + text;
  }

  // zonder actie geen knop
  setActionLabel(text) {
    const b = $('btn-action');
    b.hidden = !text;
    if (text) b.textContent = text;
  }

  setVehicleButton(label) {
    const b = $('btn-vehicle');
    b.hidden = !label;
    if (label) b.textContent = label;
  }

  // aftelklok: '98 s' wordt 1:38; de laatste 10 seconden rood
  timer(text) {
    const el = $('race-timer');
    el.hidden = text == null;
    if (text == null) return;
    let shown = String(text), secs = parseFloat(text);
    const m = /^(\d+) s$/.exec(shown);
    if (m) { const n = +m[1]; shown = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
    $('race-timer-text').textContent = shown;
    el.classList.toggle('urgent', !isNaN(secs) && secs <= 10);
  }

  // Toont een reeks regels; lines = [{name, text}] of strings. Met choices: geeft index terug.
  // Een gestopte klus mag niet verder praten: lopende gesprekken blijven dan 'hangen'
  // (de belofte lost nooit op) zodat de klus geen gevolgen meer heeft.
  cancelDialogs() {
    this.gen = (this.gen || 0) + 1;
    this.cancelUntil = performance.now() + 1500;
    $('dialog-choices').innerHTML = '';
    this.close();
  }

  async dialog(name, lines, choices = null) {
    const never = () => new Promise(() => {});
    if (performance.now() < (this.cancelUntil || 0)) return never();
    const gen = this.gen || 0;
    if (!this.dialogOpen) this.sfx?.play('open');
    this.dialogOpen = true;
    document.body.classList.add('dialog-open');
    $('dialog').hidden = false;
    this.prompt(null);
    const nextText = this.input.isTouch ? 'Tik om verder te gaan' : 'Druk op E of tik om verder te gaan';
    for (let i = 0; i < lines.length; i++) {
      $('dialog-next').textContent = lines.length > 1 ? `${nextText}  ·  ${i + 1}/${lines.length}  ›` : `${nextText}  ›`;
      const line = typeof lines[i] === 'string' ? { name, text: lines[i] } : { name, ...lines[i] };
      $('dialog-name').textContent = line.name;
      // Gulpense zin: vertaling eronder
      this.currentNl = line.nl || '';
      $('dialog-nl').textContent = line.nl ? line.nl : '';
      $('dialog-tr').hidden = !line.nl;
      this.syncTranslation();
      $('dialog-choices').innerHTML = '';
      const isLast = i === lines.length - 1;
      if (isLast && choices) {
        $('dialog-text').textContent = line.text;
        $('dialog-next').hidden = true;
        // De tik die de vorige zin wegklikte mag niet meteen een keuze maken (op Android viel die
        // 'klik' op de knop die net onder je vinger verscheen). Daarom telt een keuze pas als je
        // de knop zelf indrukt, en niet in de eerste 0,4 seconde.
        const shownAt = performance.now();
        const idx = await new Promise((resolve) => {
          choices.forEach((c, k) => {
            if (gen !== (this.gen || 0)) return;
            const b = document.createElement('button');
            b.textContent = c;
            let armed = false;
            b.addEventListener('pointerdown', () => { if (performance.now() - shownAt > 250) armed = true; });
            b.addEventListener('click', (e) => {
              const keyboard = e.detail === 0; // Enter of spatie op een knop
              if (!keyboard && (!armed || performance.now() - shownAt < 400)) return;
              resolve(k);
            });
            $('dialog-choices').appendChild(b);
          });
        });
        if (gen !== (this.gen || 0)) return never();
        $('dialog-next').hidden = false;
        $('dialog-choices').innerHTML = '';
        this.close();
        return idx;
      }
      await this.typeText(line.text, gen);
      if (gen !== (this.gen || 0)) return never();
      await this.waitAction(gen);
      if (gen !== (this.gen || 0)) return never();
    }
    this.close();
    return -1;
  }

  close() {
    $('dialog').hidden = true;
    document.body.classList.remove('dialog-open');
    this.dialogOpen = false;
    this.input.actionPressed = false;
  }

  typeText(text, gen = this.gen || 0) {
    const el = $('dialog-text');
    return new Promise((resolve) => {
      let i = 0;
      el.textContent = '';
      this.input.actionPressed = false;
      const tick = () => {
        if (gen !== (this.gen || 0)) { resolve(); return; }
        if (this.input.actionPressed) { this.input.actionPressed = false; el.textContent = text; resolve(); return; }
        i += 2;
        el.textContent = text.slice(0, i);
        if (i >= text.length) resolve();
        else setTimeout(tick, 16);
      };
      tick();
    });
  }

  waitAction(gen = this.gen || 0) {
    return new Promise((resolve) => {
      const check = () => {
        if (gen !== (this.gen || 0)) { resolve(); return; }
        if (this.input.actionPressed) { this.input.actionPressed = false; resolve(); }
        else requestAnimationFrame(check);
      };
      check();
    });
  }
}

// Ronde minikaart, gedraaid met de camera mee.
export class Minimap {
  constructor(world) {
    this.world = world;
    this.canvas = $('minimap');
    this.ctx = this.canvas.getContext('2d');
    const src = world.groundCanvas;
    // verkleinde kaart met gebouwen erop
    const b = world.coreBox;
    this.scale = 1.2; // px per meter in de bronkaart
    const w = Math.round((b.x1 - b.x0) * this.scale), h = Math.round((b.z1 - b.z0) * this.scale);
    const map = document.createElement('canvas');
    map.width = w; map.height = h;
    const c = map.getContext('2d');
    c.drawImage(src, 0, 0, w, h);
    c.fillStyle = '#c9b79a';
    c.strokeStyle = 'rgba(60,40,20,.5)';
    c.lineWidth = 0.6;
    for (const f of world.footprints) {
      if (f.extra) continue;
      c.beginPath();
      f.ring.forEach(([x, z], i) => {
        const px = (x - b.x0) * this.scale, py = (z - b.z0) * this.scale;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      });
      c.closePath(); c.fill(); c.stroke();
    }
    this.map = map;
    this.markers = [];
  }

  draw(px, pz, heading, camYaw, target, temps = []) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const b = this.world.coreBox;
    const zoom = 1.3; // schermpixels per bronpixel
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(camYaw);
    ctx.scale(zoom, zoom);
    ctx.translate(-(px - b.x0) * this.scale, -(pz - b.z0) * this.scale);
    ctx.drawImage(this.map, 0, 0);
    ctx.restore();
    for (const m of this.markers) {
      // markeringen rechtop tekenen (niet meedraaien)
      const dx = (m.x - px) * this.scale * zoom, dz = (m.z - pz) * this.scale * zoom;
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      const sx = W / 2 + dx * c - dz * s, sy = H / 2 + dx * s + dz * c;
      if (Math.hypot(sx - W / 2, sy - H / 2) > W / 2 - 6) continue;
      drawPin(ctx, sx, sy, m, 7);
    }
    // missiepunten (op te halen mensen, munten, adressen): buiten beeld aan de rand van de kaart
    const R = W / 2 - 9;
    for (const m of temps) {
      const dx = (m.x - px) * this.scale * zoom, dz = (m.z - pz) * this.scale * zoom;
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      let ex = dx * c - dz * s, ey = dx * s + dz * c;
      const d = Math.hypot(ex, ey);
      const out = d > R;
      if (out) { ex *= R / d; ey *= R / d; }
      ctx.globalAlpha = out ? 0.85 : 1;
      drawPin(ctx, W / 2 + ex, H / 2 + ey, m, out ? 5.5 : 7);
      ctx.globalAlpha = 1;
    }

    // doel: binnen bereik een pulserende ring, buiten bereik een grote pulserende pijl aan de rand met de afstand
    if (target) {
      const dx = target.x - px, dz = target.z - pz;
      const ang = Math.atan2(dz, dx) + camYaw;
      const meters = Math.hypot(dx, dz);
      const dist = meters * this.scale * zoom;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      if (dist > W / 2 - 16) {
        ctx.save();
        ctx.translate(W / 2 + Math.cos(ang) * (W / 2 - 22), H / 2 + Math.sin(ang) * (H / 2 - 22));
        ctx.rotate(ang);
        const s = 1.6 + pulse * 0.35;
        ctx.scale(s, s);
        ctx.shadowColor = 'rgba(232,163,61,0.9)'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -9); ctx.lineTo(-3, 0); ctx.lineTo(-7, 9); ctx.closePath();
        ctx.fillStyle = '#ffb300'; ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#1b2430'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        // afstand bij de pijl
        const lx = W / 2 + Math.cos(ang) * (W / 2 - 50), ly = H / 2 + Math.sin(ang) * (H / 2 - 50);
        const txt = meters >= 1000 ? (meters / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(meters / 10) * 10 + ' m';
        ctx.font = '800 15px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(27,36,48,0.9)'; ctx.strokeText(txt, lx, ly);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, lx, ly);
      } else {
        const c = Math.cos(camYaw), s = Math.sin(camYaw);
        const ex = W / 2 + (dx * c - dz * s) * this.scale * zoom, ey = H / 2 + (dx * s + dz * c) * this.scale * zoom;
        ctx.beginPath(); ctx.arc(ex, ey, 9 + pulse * 7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,179,0,${0.9 - pulse * 0.5})`; ctx.lineWidth = 4; ctx.stroke();
        drawPin(ctx, ex, ey, { color: '#ffb300', glyph: '★' }, 8);
      }
    }

    // speler
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-heading + camYaw + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = '#1f4e8c'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
}

export function drawPin(ctx, x, y, m, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = m.color;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.strokeStyle = '#1b2430';
  ctx.stroke();
  if (m.glyph) {
    ctx.fillStyle = m.glyphColor || '#1b2430';
    ctx.font = `800 ${Math.round(r * 1.2)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.glyph, x, y + r * 0.06);
  }
}

// Grote kaart: opent als je op de minikaart tikt.
export class BigMap {
  constructor(game) {
    this.g = game;
    this.el = $('bigmap');
    this.canvas = $('bigmap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.open = false;
    this.scale = 1;
    this.cx = 0; this.cz = 0;
    $('minimap-wrap').addEventListener('click', () => this.show());
    $('mission-tally').addEventListener('click', () => this.show());
    $('bigmap-close').addEventListener('click', () => this.hide());
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.open ? this.hide() : this.show();
      if (e.code === 'Escape' && this.open) this.hide();
    });
    // slepen en zoomen
    const pts = new Map();
    let lastDist = 0, moved = 0;
    this.canvas.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); this.canvas.setPointerCapture(e.pointerId); moved = 0; });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const [ox, oy] = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        const k = this.pxPerM();
        this.cx -= (e.clientX - ox) / k; this.cz -= (e.clientY - oy) / k;
        moved += Math.abs(e.clientX - ox) + Math.abs(e.clientY - oy);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastDist) this.zoom(d / lastDist);
        lastDist = d;
        moved += 10;
      }
      this.draw();
    });
    const up = (e) => {
      if (pts.size === 1 && moved < 8) this.tap(e.clientX, e.clientY);
      pts.delete(e.pointerId);
      if (pts.size < 2) lastDist = 0;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); this.draw(); }, { passive: false });
  }

  pxPerM() { return this.base * this.scale; }
  zoom(f) { this.scale = Math.max(0.6, Math.min(8, this.scale * f)); }

  show() {
    if (this.g.ui.dialogOpen) return;
    this.open = true;
    this.el.hidden = false;
    document.body.classList.add('map-open');
    const p = this.g.player;
    this.cx = p.x; this.cz = p.z;
    this.resize();
    this.scale = 1.6;
    this.renderList();
    this.draw();
  }

  hide() {
    $('bigmap').querySelector('.bm-gohere')?.remove();
    this.open = false;
    this.el.hidden = true;
    document.body.classList.remove('map-open');
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio);
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.dpr = dpr;
    const b = this.g.world.coreBox;
    this.base = Math.min(r.width / (b.x1 - b.x0), r.height / (b.z1 - b.z0));
  }

  toScreen(x, z) {
    const r = this.canvas.getBoundingClientRect();
    const k = this.pxPerM();
    return [r.width / 2 + (x - this.cx) * k, r.height / 2 + (z - this.cz) * k];
  }

  items() {
    return this.g.mapItems();
  }

  tap(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    if (this.secret?.tap(x, y, r.width, r.height)) return;
    let best = null, bd = 22;
    for (const it of this.items()) {
      const [sx, sy] = this.toScreen(it.x, it.z);
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = it; }
    }
    if (best) this.select(best);
    else if (this.secret?.on) this.offerGoHere(x, y, this.cx + (x - r.width / 2) / this.pxPerM(), this.cz + (y - r.height / 2) / this.pxPerM());
  }

  // beheerdersmodus: op een leeg punt op de kaart tikken geeft een knop 'Ga hierheen'
  offerGoHere(sx, sy, wx, wz) {
    $('bigmap').querySelector('.bm-gohere')?.remove();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bm-gohere';
    b.textContent = 'Ga hierheen';
    const r = this.canvas.getBoundingClientRect(), host = $('bigmap').getBoundingClientRect();
    b.style.left = `${r.left - host.left + sx}px`;
    b.style.top = `${r.top - host.top + sy}px`;
    b.addEventListener('click', (e) => { e.stopPropagation(); b.remove(); this.g.fastTravel({ x: wx, z: wz, title: 'Gekozen plek', free: true }); });
    $('bigmap').appendChild(b);
    setTimeout(() => b.remove(), 10000);
  }

  select(it) {
    this.selected = it.key;
    this.g.setWaypoint(it);
    this.cx = it.x; this.cz = it.z;
    this.renderList();
    this.draw();
    // de lijst springt naar de gekozen missie, zodat je ziet wat welk punt is
    const el = $('bigmap-list').querySelector('.bm-item.sel');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('flash');
    }
  }

  renderList() {
    const list = $('bigmap-list');
    list.innerHTML = '';
    for (const it of this.items()) {
      const b = document.createElement('button');
      b.className = 'bm-item' + (this.selected === it.key ? ' sel' : '');
      b.innerHTML = `<span class="bm-pin" style="background:${it.color}">${it.glyph || ''}</span><span class="bm-text"><b></b><small></small></span><span class="bm-state"></span>`;
      b.querySelector('b').textContent = it.title;
      b.querySelector('small').textContent = it.place;
      const st = b.querySelector('.bm-state');
      st.textContent = it.stateLabel || '';
      st.dataset.state = it.state || '';
      b.addEventListener('click', () => this.select(it));
      if (this.secret?.on && it.npc !== false) {
        const go = document.createElement('span');
        go.className = 'bm-go';
        b.classList.add('has-go');
        go.textContent = 'Ga erheen';
        go.addEventListener('click', (e) => { e.stopPropagation(); this.g.fastTravel(it); });
        b.appendChild(go);
      }
      list.appendChild(b);
    }
  }

  draw() {
    if (!this.open) return;
    const ctx = this.ctx, dpr = this.dpr;
    const r = this.canvas.getBoundingClientRect();
    const mm = this.g.minimap;
    const b = this.g.world.coreBox;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#5f7f45';
    ctx.fillRect(0, 0, r.width, r.height);
    const k = this.pxPerM();
    const [ox, oy] = this.toScreen(b.x0, b.z0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mm.map, ox, oy, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    // straatnamen bij genoeg zoom
    if (k > 1.6) {
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = 'rgba(20,24,30,0.85)';
      ctx.textAlign = 'center';
      for (const [name, x, z] of this.g.world.objects.labels) {
        const [sx, sy] = this.toScreen(x, z);
        if (sx < -50 || sy < -20 || sx > r.width + 50 || sy > r.height + 20) continue;
        ctx.fillText(name, sx, sy);
      }
    }
    for (const it of this.items()) {
      const [sx, sy] = this.toScreen(it.x, it.z);
      drawPin(ctx, sx, sy, it, this.selected === it.key ? 14 : 11);
    }
    // missiepunten en het huidige doel
    for (const m of this.g.missionPoints()) {
      const [sx, sy] = this.toScreen(m.x, m.z);
      drawPin(ctx, sx, sy, m, 9);
    }
    const t = this.g.target ? this.g.target.pos : this.g.waypoint;
    if (t) {
      const [sx, sy] = this.toScreen(t.x, t.z);
      drawPin(ctx, sx, sy, { color: '#e8a33d', glyph: '★' }, 10);
    }
    // speler
    const p = this.g.player;
    const [px, py] = this.toScreen(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.heading + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = '#1f4e8c'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }
}
