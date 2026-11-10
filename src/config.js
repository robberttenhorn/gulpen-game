// Naam van het spel. "Locals" is de serienaam; de plaatsnaam wissel je hier voor een ander dorp, een stad of een wijk.
//
// Dezelfde code draait op twee plekken: de echte game (gulpen-game) en de proefversie (gulpen-game-hd).
// Het adres bepaalt welke van de twee het is. Zo kan dezelfde code naar beide worden gepubliceerd:
// - de echte game gebruikt de opslagnamen die beginnen met 'gulpe-' (dezelfde als altijd: voortgang blijft bewaard),
//   telt anoniem mee en heet "Locals: Gulpen";
// - de proefversie bewaart alles apart onder 'gulpehd-', telt niet mee en heet "Locals: Gulpen HD".
export const HD_PROEF = typeof location !== 'undefined' && /gulpen-game-hd/.test(location.pathname);
export const SERIES = 'Locals';
export const PLACE = HD_PROEF ? 'Gulpen HD' : 'Gulpen';
export const GAME_NAME = `${SERIES}: ${PLACE}`;
// voorvoegsel van alles wat in de browser wordt bewaard (missies, records, geluid, beeldkwaliteit...)
export const STORE = HD_PROEF ? 'gulpehd-' : 'gulpe-';
// code van de anonieme telling (GoatCounter); leeg = uit
export const GOATCOUNTER = HD_PROEF ? '' : '10horn';
