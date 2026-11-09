// Geluidseffecten, helemaal in de browser opgewekt (WebAudio), zonder geluidsbestanden.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('gulpe-geluid') === 'uit'; } catch { /* geen opslag */ }
    this.engine = null;
  }

  // Moet gestart worden vanuit een klik of tik (regel van de browser).
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    // korte ruisbuffer voor stappen, spetters en dergelijke
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.keepAlive();
  }

  // Na wisselen van app zet de browser (vooral Safari op iPhone) het geluid op pauze en start het niet vanzelf weer.
  // Daarom: zelf pauzeren als het spel uit beeld gaat, en weer aanzetten bij terugkomen of bij de eerstvolgende tik of toets.
  keepAlive() {
    const ctx = this.ctx;
    const wake = () => {
      if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || document.hidden) return;
      ctx.resume().catch(() => {});
      // iOS: een heel kort stil geluidje binnen een tik ontgrendelt het geluid weer
      try { const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0); } catch { /* negeren */ }
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); } else wake();
    });
    addEventListener('pageshow', wake);
    addEventListener('focus', wake);
    // valt het geluid onderweg weg (bijv. een telefoontje), dan bij de volgende gelegenheid weer aan
    ctx.onstatechange = () => { if (ctx.state !== 'running' && !document.hidden) setTimeout(wake, 300); };
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('gulpe-geluid', m ? 'uit' : 'aan'); } catch { /* negeren */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------ bouwstenen

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = null, attack = 0.005, out = null } = {}) {
    if (!this.ctx || !Number.isFinite(freq) || !Number.isFinite(dur) || !Number.isFinite(vol)) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(dur, { vol = 0.2, at = 0, filter = 'lowpass', freq = 1200, q = 0.7, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ omgevingsgeluid
  // Doorlopend geluid op een plek (geroezemoes op de Markt, kabbelend water). set(v) regelt het volume (0 = stil).
  loop(kind) {
    if (!this.ctx || !this.noise) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f1 = this.ctx.createBiquadFilter(), f2 = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain(); g.gain.value = 0;
    if (kind === 'markt') { f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 0.9; f2.type = 'lowpass'; f2.frequency.value = 1400; }
    else { f1.type = 'bandpass'; f1.frequency.value = 2600; f1.Q.value = 0.5; f2.type = 'highpass'; f2.frequency.value = 700; }
    src.connect(f1).connect(f2).connect(g).connect(this.master);
    src.start(0, Math.random() * 0.9);
    return {
      set: (v, wobble = 0) => {
        if (!Number.isFinite(v)) return;
        g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.5);
        if (kind === 'markt') f1.frequency.setTargetAtTime(480 + wobble * 160, this.ctx.currentTime, 0.6); // stemmen gaan op en neer
      },
    };
  }

  // ------------------------------------------------------------ feestmuziek (eigen deuntje, hoempa-stijl)

  startMusic() {
    if (!this.ctx || this.music) return;
    // eigen volumeknop, zodat de muziek bij stoppen meteen stil is (ook al ingeplande noten)
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    const out = this.musicBus;
    const bpm = 132, e = 60 / bpm / 2; // duur van een achtste
    const f = (n) => 440 * Math.pow(2, (n - 69) / 12);
    // melodie in achtsten: [noot (MIDI) of null, lengte]
    const mel = [
      [67, 1], [72, 1], [72, 1], [74, 1], [76, 2], [72, 2],
      [74, 1], [74, 1], [71, 1], [74, 1], [79, 2], [74, 2],
      [76, 1], [76, 1], [72, 1], [76, 1], [79, 2], [76, 1], [79, 1],
      [81, 2], [77, 2], [72, 2], [77, 2],
      [79, 1], [79, 1], [76, 1], [79, 1], [84, 2], [79, 2],
      [77, 1], [77, 1], [74, 1], [77, 1], [79, 2], [71, 2],
      [72, 1], [76, 1], [79, 1], [76, 1], [74, 2], [71, 2],
      [72, 4], [null, 4],
    ];
    const roots = [48, 43, 48, 41, 48, 43, 48, 48]; // C G C F C G C C
    const loop = () => {
      if (!this.music) return;
      let at = 0.05;
      for (const [n, len] of mel) {
        if (n) { this.tone(f(n), len * e * 0.9, { type: 'square', vol: 0.035, at, out }); this.tone(f(n + 12), len * e * 0.6, { type: 'sine', vol: 0.02, at, out }); }
        at += len * e;
      }
      roots.forEach((r, bar) => {
        for (let beat = 0; beat < 4; beat++) {
          const t0 = 0.05 + (bar * 4 + beat) * e * 2;
          if (beat % 2 === 0) this.tone(f(r - 12 + (beat === 2 ? 7 : 0)), e * 1.6, { type: 'triangle', vol: 0.2, at: t0, out }); // hoem
          else for (const k of [0, 4, 7]) this.tone(f(r + 12 + k), e * 0.7, { type: 'square', vol: 0.018, at: t0, out }); // pa
        }
      });
    };
    this.music = setInterval(loop, mel.reduce((s, [, l]) => s + l, 0) * e * 1000);
    loop();
  }

  stopMusic() {
    clearInterval(this.music);
    this.music = null;
    if (this.musicBus) { const b = this.musicBus; b.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => b.disconnect(), 2000); this.musicBus = null; }
  }

  // ------------------------------------------------------------ geluiden

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'step': this.hiss(0.07, { vol: 0.05, freq: 700 + Math.random() * 300 }); break;
      case 'bell': // fietsbel: tring tring
        for (const at of [0, 0.16]) { this.tone(2350, 0.35, { vol: 0.12, at }); this.tone(3120, 0.3, { vol: 0.06, at }); }
        break;
      case 'door': this.hiss(0.12, { vol: 0.25, freq: 300 }); this.tone(90, 0.12, { vol: 0.2, type: 'triangle' }); break;
      case 'coin': this.tone(988, 0.08, { type: 'square', vol: 0.08 }); this.tone(1319, 0.25, { type: 'square', vol: 0.08, at: 0.07 }); break;
      case 'success': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.14, at: i * 0.1 })); break;
      case 'fail': this.tone(392, 0.25, { type: 'triangle', vol: 0.14 }); this.tone(294, 0.45, { type: 'triangle', vol: 0.14, at: 0.2 }); break;
      case 'pop': this.tone(600, 0.1, { vol: 0.12, slide: 1200 }); break;
      case 'splash': this.hiss(0.5, { vol: 0.25, filter: 'bandpass', freq: 1800, q: 0.6 }); break;
      case 'splat': this.hiss(0.25, { vol: 0.3, freq: 400 }); this.tone(120, 0.18, { vol: 0.2, type: 'triangle', slide: 60 }); break;
      case 'clink': this.tone(3150, 0.4, { vol: 0.1 }); this.tone(4230, 0.3, { vol: 0.06 }); this.tone(3150, 0.35, { vol: 0.07, at: 0.09 }); break;
      case 'gulp': for (let i = 0; i < 3; i++) this.tone(180, 0.12, { vol: 0.12, slide: 120, at: i * 0.32, type: 'triangle' }); break;
      case 'kick': this.tone(150, 0.15, { vol: 0.3, slide: 50, type: 'triangle' }); this.hiss(0.08, { vol: 0.15, freq: 900 }); break;
      case 'cheer': this.hiss(1.6, { vol: 0.18, filter: 'bandpass', freq: 1400, q: 0.4, attack: 0.25 }); break;
      case 'whistle': this.tone(2900, 0.5, { vol: 0.1, type: 'square' }); break;
      case 'crash': this.hiss(0.4, { vol: 0.35, freq: 900 }); this.tone(70, 0.3, { vol: 0.3, type: 'triangle', slide: 40 }); break;
      case 'open': this.tone(880, 0.06, { vol: 0.05 }); break;
      case 'bells': // kerkklokken
        [0, 0.9, 1.8].forEach((at, i) => { const f = [392, 330, 262][i]; this.tone(f, 2.2, { vol: 0.16, at }); this.tone(f * 2.4, 1.4, { vol: 0.05, at }); this.tone(f * 3.0, 1.0, { vol: 0.03, at }); });
        break;
      case 'chirp': { const f = 2600 + Math.random() * 1500; this.tone(f, 0.08, { vol: 0.03, slide: f * 1.3 }); this.tone(f * 1.1, 0.08, { vol: 0.025, at: 0.12, slide: f * 0.9 }); break; }
      case 'cricket': for (let i = 0; i < 3; i++) this.tone(4300, 0.04, { vol: 0.015, at: i * 0.06, type: 'square' }); break;
      case 'tally': this.tone(1000, 0.4, { vol: 0.06, type: 'square' }); break;
      case 'camera': this.hiss(0.05, { vol: 0.2, freq: 3000 }); this.hiss(0.05, { vol: 0.15, freq: 2000, at: 0.08 }); break;
      case 'skid': this.hiss(0.55, { vol: 0.14, filter: 'bandpass', freq: 2400, q: 6 }); this.tone(1900, 0.5, { vol: 0.03, type: 'sawtooth', slide: 1500 }); break;
      case 'honk': this.tone(415, 0.22, { type: 'square', vol: 0.09 }); this.tone(349, 0.22, { type: 'square', vol: 0.07 }); this.tone(415, 0.35, { type: 'square', vol: 0.09, at: 0.3 }); this.tone(349, 0.35, { type: 'square', vol: 0.07, at: 0.3 }); break;
      case 'launch': this.hiss(0.9, { vol: 0.07, filter: 'bandpass', freq: 3000, q: 1.5, attack: 0.3 }); this.tone(500, 0.9, { vol: 0.02, slide: 1800, type: 'sine' }); break;
      case 'boom': this.tone(70, 0.7, { vol: 0.3, type: 'triangle', slide: 35 }); this.hiss(1.1, { vol: 0.22, freq: 1600 }); for (let i = 0; i < 5; i++) this.hiss(0.05, { vol: 0.06, filter: 'highpass', freq: 5000, at: 0.25 + i * 0.09 + Math.random() * 0.05 }); break;
      case 'squeak': { const f = 900 + Math.random() * 500; this.tone(f, 0.18, { type: 'sawtooth', vol: 0.035, slide: f * 1.35 }); this.tone(f * 1.5, 0.12, { type: 'square', vol: 0.015, at: 0.05, slide: f * 1.1 }); break; }
      case 'creak': this.tone(140 + Math.random() * 60, 0.32, { type: 'sawtooth', vol: 0.05, slide: 95 }); this.hiss(0.25, { vol: 0.05, filter: 'bandpass', freq: 600, q: 4 }); break;
      case 'cart': this.hiss(0.2, { vol: 0.08, filter: 'bandpass', freq: 3000, q: 3 }); break;
      default: break;
    }
  }

  // motorgeluid dat meegaat met de snelheid
  engineOn(low = false) {
    if (!this.ctx || this.engine) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o.start(); o2.start();
    this.engine = { o, o2, f, g, low };
    g.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.2);
  }

  engineUpdate(speed, throttle) {
    const e = this.engine;
    if (!e) return;
    // een ongeldige snelheid (NaN) laat de browser een fout gooien en de hele game haperen
    if (!Number.isFinite(speed)) speed = 0;
    if (!Number.isFinite(throttle)) throttle = 0;
    const base = e.low ? 32 : 45;
    const freq = base + Math.abs(speed) * (e.low ? 3 : 2.6) + (throttle > 0 ? 8 : 0);
    const t = this.ctx.currentTime;
    e.o.frequency.setTargetAtTime(freq, t, 0.08);
    e.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.08);
    e.f.frequency.setTargetAtTime(300 + Math.abs(speed) * 25, t, 0.1);
    e.g.gain.setTargetAtTime(this.muted ? 0 : 0.045 + Math.min(0.05, Math.abs(throttle) * 0.03 + Math.abs(speed) * 0.0012), t, 0.1);
  }

  engineOff() {
    const e = this.engine;
    if (!e) return;
    e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch { /* al gestopt */ } }, 500);
    this.engine = null;
  }
}
