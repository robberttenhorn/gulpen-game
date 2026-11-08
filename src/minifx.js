// Gedeelde effecten voor de minigames: zwevende teksten, flitsen, trillen, combo's en deeltjes.
// Zo geeft elk spel direct zichtbare reactie op wat je doet.

// Zwevende tekst (bijv. '+1', 'Perfect!') op een plek in de beeldlaag (x, y in procenten).
export function popText(ov, text, x = 50, y = 45, cls = '') {
  const el = document.createElement('div');
  el.className = 'fx-pop ' + cls;
  el.textContent = text;
  el.style.left = x + '%';
  el.style.top = y + '%';
  ov.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// Kort gekleurd flitsje over het hele scherm ('good', 'bad', 'gold').
export function flash(ov, kind = 'good') {
  const el = document.createElement('div');
  el.className = 'fx-flash ' + kind;
  ov.appendChild(el);
  setTimeout(() => el.remove(), 380);
}

// Element even laten trillen.
export function shake(el, strong = false) {
  if (!el) return;
  el.classList.remove('fx-shake', 'fx-shake-strong');
  void el.offsetWidth; // animatie opnieuw starten
  el.classList.add(strong ? 'fx-shake-strong' : 'fx-shake');
}

// Element even laten 'ploppen' (groter en terug).
export function bump(el) {
  if (!el) return;
  el.classList.remove('fx-bump');
  void el.offsetWidth;
  el.classList.add('fx-bump');
}

// Combo-teller: 'x3!' bij meerdere goede acties achter elkaar.
export function makeCombo(ov) {
  let n = 0;
  const el = document.createElement('div');
  el.className = 'fx-combo';
  ov.appendChild(el);
  return {
    hit() { n++; if (n >= 2) { el.textContent = `x${n} combo!`; bump(el); el.style.opacity = 1; } return n; },
    miss() { n = 0; el.style.opacity = 0; },
    get n() { return n; },
  };
}

// Eenvoudige deeltjes voor canvas-spellen (schuim, scherven, vonken, kruimels).
export class Particles {
  constructor() { this.list = []; }
  spawn(x, y, n, { color = '#fff', speed = 240, up = 160, size = 4, life = 0.8, gravity = 900, spread = Math.PI * 2, dir = -Math.PI / 2, shape = 'rect' } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up * Math.random(), size: size * (0.6 + Math.random() * 0.8), life, max: life, color, gravity, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, shape });
    }
  }
  update(dt) {
    for (const p of this.list) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.rot += p.vr * dt; p.life -= dt; }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(ctx) {
    for (const p of this.list) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill(); }
      else if (p.shape === 'shard') { ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.4); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size * 0.3, p.size * 0.6); ctx.closePath(); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }
}

// Canvas op de juiste resolutie zetten (ook na draaien van de telefoon).
export function fitCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * devicePixelRatio)), h = Math.max(1, Math.round(r.height * devicePixelRatio));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
