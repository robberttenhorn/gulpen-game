import { GAME_NAME } from './config.js';
// Melding als er een nieuwere versie van de game online staat.
// Elke build schrijft version.json met een eigen versienummer (zie vite.config.js).
// De game vergelijkt dat af en toe met zijn eigen nummer; is het anders, dan verschijnt een balk.
const MINE = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null;

export function startUpdateCheck() {
  if (!MINE) return;
  let shown = false, last = 0;
  const check = async () => {
    if (shown || document.hidden || Date.now() - last < 20000) return;
    last = Date.now();
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return; // bijvoorbeeld tijdens het ontwikkelen: geen version.json
      const { build } = await r.json();
      if (build && build !== MINE) show();
    } catch { /* geen verbinding: later opnieuw */ }
  };
  const show = () => {
    shown = true;
    const b = document.createElement('button');
    b.id = 'update-bar';
    b.type = 'button';
    b.innerHTML = `<b>Er is een nieuwe versie van ${GAME_NAME}!</b><span>Tik om te vernieuwen. Je missies blijven bewaard.</span>`;
    b.addEventListener('click', () => location.reload());
    document.body.appendChild(b);
  };
  // bij terugkomen in het tabblad (telefoon uit de zak), bij focus en elke 5 minuten
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('focus', check);
  setInterval(check, 5 * 60 * 1000);
  setTimeout(check, 30000);
}
