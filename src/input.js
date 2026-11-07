// Toetsenbord, muis en touch-besturing.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.actionPressed = false;
    this.vehiclePressed = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.actionPressed = true;
      if (e.code === 'Space') this.spacePressed = true;
      if (e.code === 'KeyF') this.vehiclePressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // kijken met muis (slepen) of touch (rechterhelft)
    let dragId = null, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (dragId !== null) return;
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.4) return;
      dragId = e.pointerId; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== dragId) return;
      this.lookDelta.x += e.clientX - lx;
      this.lookDelta.y += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId === dragId) dragId = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // niet zoomen: geen scrollwiel-zoom van de camera, en de pagina zelf ook niet laten zoomen
    // (iPhone negeert user-scalable=no, dus knijpen en dubbeltikken hier tegenhouden)
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !e.target.closest?.('#bigmap')) e.preventDefault(); }, { passive: false });
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 320 && !e.target.closest?.('button, #bigmap, #dialog')) e.preventDefault();
      lastTap = now;
    }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());

    // virtuele joystick
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let joyId = null;
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / max, y: dy / max };
    };
    joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); setJoy(e); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) setJoy(e); });
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; this.joy = null; knob.style.transform = '';
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    document.getElementById('btn-action').addEventListener('pointerdown', (e) => { e.preventDefault(); this.actionPressed = true; });
    document.getElementById('btn-vehicle').addEventListener('pointerdown', (e) => { e.preventDefault(); this.vehiclePressed = true; });
  }

  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('KeyZ')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft') || k.has('KeyQ')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.joy) { x = this.joy.x; y = this.joy.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy && Math.hypot(this.joy.x, this.joy.y) > 0.95);
  }

  consumeLook() {
    const d = { ...this.lookDelta };
    this.lookDelta.x = 0; this.lookDelta.y = 0;
    return d;
  }
  consumeAction() { const a = this.actionPressed; this.actionPressed = false; return a; }
  consumeVehicle() { const a = this.vehiclePressed; this.vehiclePressed = false; return a; }
}
