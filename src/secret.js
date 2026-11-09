// Geheime snelreismodus voor de maker.
// Op de grote kaart 7 keer snel (binnen 3 seconden) op 'Gulpen' tikken: aan. Nog eens 7 keer: uit.
// Daarna staat bij elke missie op de grote kaart een knop 'Ga erheen', en geeft tikken op een leeg punt van de kaart
// een knop 'Ga hierheen'. De keuze blijft bewaard op dat apparaat.
const KEY = 'gulpehd-snelreis';

export function setupSecret(bigmap, game) {
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch { /* geen opslag */ }
  const title = document.querySelector('#bigmap .bm-head span');
  let taps = [];
  title.addEventListener('pointerdown', () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 3000);
    taps.push(now);
    if (taps.length < 7) return;
    taps = [];
    on = !on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* geen opslag */ }
    game.ui.toast(on ? 'Snelreismodus aan' : 'Snelreismodus uit', 1600);
    navigator.vibrate?.([40, 60, 40]);
    bigmap.renderList();
  });
  return { get on() { return on; }, tap: () => false };
}
