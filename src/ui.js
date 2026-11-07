// Alles wat over het 3D-beeld heen ligt: dialogen, opdrachtkaart, straatnaambord, minikaart.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(input) {
    this.input = input;
    this.dialogOpen = false;
    this.toastTimer = null;
    $('dialog').addEventListener('pointerdown', (e) => {
      if (e.target.tagName !== 'BUTTON') this.input.actionPressed = true;
    });
  }

  setQuest(title, desc, progress = '') {
    $('quest-title').textContent = title;
    $('quest-desc').textContent = desc;
    $('quest-progress').textContent = progress;
  }
  setProgress(text) { $('quest-progress').textContent = text; }

  setStreet(name) {
    const el = $('street-name');
    if (el.textContent !== name) el.textContent = name;
    $('street-sign').style.opacity = name ? 1 : 0;
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

  setActionLabel(text) { $('btn-action').textContent = text; }

  setVehicleButton(label) {
    const b = $('btn-vehicle');
    b.hidden = !label;
    if (label) b.textContent = label;
  }

  timer(text) {
    const el = $('race-timer');
    el.hidden = text == null;
    if (text != null) el.textContent = text;
  }

  // Toont een reeks regels; lines = [{name, text}] of strings. Met choices: geeft index terug.
  async dialog(name, lines, choices = null) {
    this.dialogOpen = true;
    $('dialog').hidden = false;
    this.prompt(null);
    $('dialog-next').textContent = this.input.isTouch ? 'Tik om verder te gaan' : 'Druk op E of tik om verder te gaan';
    for (let i = 0; i < lines.length; i++) {
      const line = typeof lines[i] === 'string' ? { name, text: lines[i] } : lines[i];
      $('dialog-name').textContent = line.name;
      $('dialog-choices').innerHTML = '';
      const isLast = i === lines.length - 1;
      if (isLast && choices) {
        $('dialog-text').textContent = line.text;
        $('dialog-next').hidden = true;
        const idx = await new Promise((resolve) => {
          choices.forEach((c, k) => {
            const b = document.createElement('button');
            b.textContent = c;
            b.addEventListener('click', () => resolve(k));
            $('dialog-choices').appendChild(b);
          });
        });
        $('dialog-next').hidden = false;
        $('dialog-choices').innerHTML = '';
        this.close();
        return idx;
      }
      await this.typeText(line.text);
      await this.waitAction();
    }
    this.close();
    return -1;
  }

  close() {
    $('dialog').hidden = true;
    this.dialogOpen = false;
    this.input.actionPressed = false;
  }

  typeText(text) {
    const el = $('dialog-text');
    return new Promise((resolve) => {
      let i = 0;
      el.textContent = '';
      this.input.actionPressed = false;
      const tick = () => {
        if (this.input.actionPressed) { this.input.actionPressed = false; el.textContent = text; resolve(); return; }
        i += 2;
        el.textContent = text.slice(0, i);
        if (i >= text.length) resolve();
        else setTimeout(tick, 16);
      };
      tick();
    });
  }

  waitAction() {
    return new Promise((resolve) => {
      const check = () => {
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

  draw(px, pz, heading, camYaw, target) {
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
    for (const m of this.markers) {
      const mx = (m.x - b.x0) * this.scale, my = (m.z - b.z0) * this.scale;
      ctx.beginPath();
      ctx.arc(mx, my, m.active ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = m.active ? '#e8a33d' : m.color || '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b2430'; ctx.stroke();
    }
    ctx.restore();

    // pijl naar doel als dat buiten beeld is
    if (target) {
      const dx = target.x - px, dz = target.z - pz;
      const ang = Math.atan2(dz, dx) + camYaw;
      const dist = Math.hypot(dx, dz) * this.scale * zoom;
      if (dist > W / 2 - 10) {
        ctx.save();
        ctx.translate(W / 2 + Math.cos(ang) * (W / 2 - 14), H / 2 + Math.sin(ang) * (H / 2 - 14));
        ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.fillStyle = '#e8a33d'; ctx.fill(); ctx.strokeStyle = '#1b2430'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
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
