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
- Computer: WASD of pijltjes om te bewegen, Shift om te rennen, muis slepen om te kijken, scrollen om te zoomen,
  E om te praten of in en uit te stappen, F voor fiets of skateboard, spatie als handrem, M voor de kaart.
- Mobiel: joystick links, slepen op de rechterhelft om te kijken, knoppen rechtsonder. Tik op de minikaart voor de grote kaart.

**Vervoer**: lopen (ongeveer 15 km/u, rennen 23 km/u), skateboard (34 km/u), fiets (45 km/u) en auto's (tot 120 km/u).
Overal staan auto's waar je in kunt stappen: op parkeerplaatsen en op opritten door het hele dorp, bij elke start op andere plekken. Er zijn ook sportwagens, en op het boerenland staat een tractor.
Water kun je niet in. Er rijdt verkeer over het echte wegennet en er lopen dorpsbewoners rond.

## Klussen

Alle klussen staan tegelijk open. Je kiest zelf de volgorde. Op de grote kaart zie je ze allemaal, met hun status.

| Klus | Waar |
| --- | --- |
| Lekke band: je fiets laten maken | Jef Abels Bikes, Rijksweg 113 |
| Frikandel speciaal: alleen contant, dus eerst muntjes zoeken | Friture An + Piet, Rijksweg 60B |
| Bezorgen voor Salma: drie bestellingen op tijd (beloning: Broodje Gulpen) | Grillroom Pizzeria Salma, Rijksweg 60A |
| Friet bij Zheng: kies je saus | Cafetaria Zheng, Looierstraat 103 |
| In beslag genomen: skateboard ophalen met een overhoring | Sophianum, Landsraderweg 7 |
| Ringweg Race: skatewedstrijd | Ringweg |
| Vers van 't vat: een vat naar de Zwarte Ruiter brengen | Gulpener Bierbrouwerij, Rijksweg 16 |
| Pilsje: daarna wordt het avond (of weer ochtend) | Herberg De Zwarte Ruiter, Markt 4 |
| Penalty's: scoor er 3 van de 5 | Sportpark FC Gulpen, Ringweg 14 |
| Een schimmig zaakje: een pakketje snel bezorgen | Mariabeeld, top van de Gulperberg |
| De Nachtburgemeester (alleen 's avonds): zoek zijn ambtsketen | Markt |
| Gulperberg op!: fietstijdrit naar het Mariabeeld | Voet van de Gulperberg |
| Gerst voor de brouwerij: met de tractor naar Gulpener | Boerenland aan de rand van het dorp |
| Vissen in de Gulp: vang drie vissen | Oever van de Gulp |
| Polonaise door Gulpe: verzamel feestgangers voor de Vastelaovesfinale | Markt |
| Nacht van Gulpen (alleen 's avonds): wandelen langs vijf stempelposten | Bij de Markt |

Voortgang wordt in de browser bewaard.

## Data

Alle data staat al in `public/data/`. Opnieuw ophalen (duurt een paar minuten):

```bash
NODE_USE_ENV_PROXY=1 npm run data   # NODE_USE_ENV_PROXY alleen nodig achter een proxy
```

| Bron | Wat | Licentie |
| --- | --- | --- |
| [3D BAG](https://3dbag.nl) (TU Delft / 3DGI) | Gebouwen in 3D (LoD 2.2) | CC BY 4.0 |
| [AHN](https://www.ahn.nl) via PDOK | Hoogtekaart maaiveld | CC0 |
| [BGT](https://www.pdok.nl) via PDOK | Wegen, water, groen, bomen, bankjes, lantaarnpalen, verkeersborden, sportvelden | CC0 |
| [NWB](https://www.pdok.nl) (Rijkswaterstaat) via PDOK | Wegennet met straatnamen | CC0 |

Voor de 3D BAG is bronvermelding verplicht (CC BY 4.0). Die staat rechtsonder in beeld.

## Naar een ander dorp of andere stad

Het concept is herbruikbaar. In `tools/fetch-data.mjs` pas je aan:
- `ORIGIN`: middelpunt van de spelwereld (RD-coördinaten).
- `CORE` en `WIDE`: het speelgebied en het grotere gebied voor de horizon.
- `POIS`: de herkenbare plekken.

De klussen en teksten staan in `src/missions.js`, de gevels van de zaken in `src/facades.js`.

## Nog te controleren

- **Dialect**: de teksten zijn nu vooral Nederlands met een paar Limburgse woorden. Een echte Gulpenaar moet dit nalopen en aanvullen.
- **Echte personen**: bewust weggelaten. De mensen in de zaken zijn verzonnen rollen ("de monteur", "de waard"). De nachtburgemeester is verzonnen.
- **Merken**: Gulpener, An + Piet, Salma, Zheng, Jef Abels, De Zwarte Ruiter, Sophianum en FC Gulpen worden bij naam genoemd. Vraag toestemming voordat de game breed gedeeld wordt. Er worden geen echte logo's gebruikt.
- **Mariabeeld**: de plek komt uit de BGT (een monument op 157 m, de top van de Gulperberg). Het beeld zelf is een gestileerde benadering, niet het echte ontwerp.
- **Gevels**: de borden, luifels en etalages van de zaken zijn verzonnen in een passende stijl, niet nagemaakt van de echte gevels. Met foto's kan dit realistischer.

## Techniek

Vite + Three.js, geen game-engine.
- Gebouwen krijgen in een shader baksteen, mergelblokken, pleisterwerk, kozijnen met roeden, deuren en dakpannen. 's Avonds gaan ramen branden.
- Wegen, stoepen (met stoepranden), fietspaden, parkeervakken en water zijn losse meshes uit de BGT-vlakken die het terrein volgen, met herhalende textures.
- Omgevingsreflecties uit de lucht (auto's, ramen, water) en op de computer een lichte gloed (bloom), vooral 's avonds.
- Bomen staan per vak van 250 m, geparkeerde auto's en poppetjes zijn gebundeld, zodat het ook op telefoons draait.
