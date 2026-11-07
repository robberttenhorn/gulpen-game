# Gulpe! Ein daag in Gulpen

Een browsergame die zich afspeelt in het echte Gulpen (Zuid-Limburg). Het dorp is opgebouwd uit open overheidsdata:
elk huis staat op de goede plek met de echte dakvorm, de straten hebben hun echte namen, en het reliëf van het Heuvelland klopt.

## Spelen

```bash
npm install
npm run dev
```

Open daarna de link die Vite toont (meestal http://localhost:5173).

**Besturing**
- Computer: WASD of pijltjes om te lopen, Shift om te rennen, muis slepen om te kijken, scrollen om te zoomen, E om te praten, F om van voertuig te wisselen.
- Mobiel: joystick links, slepen op de rechterhelft om te kijken, knoppen rechtsonder.

## Het verhaal

1. **Lekke band**: laat je fiets maken bij Jef Abels Bikes (Rijksweg).
2. **Honger!**: een frikandel speciaal bij Friture An + Piet bij het busstation. Alleen contant, dus eerst muntjes zoeken.
3. **In beslag genomen**: haal je skateboard op bij de conciërge van het Sophianum (met een overhoring over Gulpen).
4. **Ringweg Race**: skatewedstrijd over de echte Ringweg, tegen de klok en een andere skater.
5. **Vers van 't vat**: haal een vat op bij de Gulpener Bierbrouwerij en breng het naar Herberg De Zwarte Ruiter.
6. **Pilsje**: daarna valt de avond.
7. **Side quest, De Nachtburgemeester**: 's avonds bij de Markt. Hij is zijn ambtsketen kwijt bij een bruggetje over de Gulp.

## Data

Alle data staat al in `public/data/`. Opnieuw ophalen (duurt een paar minuten):

```bash
NODE_USE_ENV_PROXY=1 npm run data   # NODE_USE_ENV_PROXY alleen nodig achter een proxy
```

| Bron | Wat | Licentie |
| --- | --- | --- |
| [3D BAG](https://3dbag.nl) (TU Delft / 3DGI) | Gebouwen in 3D (LoD 2.2) | CC BY 4.0 |
| [AHN](https://www.ahn.nl) via PDOK | Hoogtekaart maaiveld | CC0 |
| [BGT](https://www.pdok.nl) via PDOK | Wegen, water, groen, bomen, bankjes, lantaarnpalen | CC0 |
| [NWB](https://www.pdok.nl) (Rijkswaterstaat) via PDOK | Wegennet met straatnamen | CC0 |

Voor de 3D BAG is bronvermelding verplicht (CC BY 4.0). Die staat rechtsonder in beeld.

## Naar een ander dorp of andere stad

Het concept is herbruikbaar. In `tools/fetch-data.mjs` pas je aan:
- `ORIGIN`: middelpunt van de spelwereld (RD-coördinaten).
- `CORE` en `WIDE`: het speelgebied en het grotere gebied voor de horizon.
- `POIS`: de herkenbare plekken.

De opdrachten en teksten staan in `src/quests.js`.

## Nog te controleren

- **Dialect**: de teksten zijn nu vooral Nederlands met een paar Limburgse woorden. Een echte Gulpenaar moet dit nalopen en aanvullen.
- **Echte personen**: bewust weggelaten. De mensen in de zaken zijn verzonnen rollen ("de monteur", "de waard"). De nachtburgemeester is verzonnen.
- **Merken**: Gulpener, An + Piet, Jef Abels, De Zwarte Ruiter en Sophianum worden bij naam genoemd. Vraag toestemming voordat de game breed gedeeld wordt.

## Techniek

Vite + Three.js, geen game-engine. Gebouwen krijgen in een shader procedurele ramen die 's avonds oplichten.
De ondergrond is een textuur die in de browser getekend wordt uit de BGT-vlakken.
