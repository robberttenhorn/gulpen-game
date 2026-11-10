# Auto's in de HD-versie: notities

Alles is in code opgebouwd, zonder externe modellen of texturen. Getest zonder videokaart (Chromium met
SwiftShader), dus over snelheid op een echte laptop of telefoon zegt dit niets: alleen aantallen driehoeken en
tekenopdrachten zijn gemeten.

## Bestanden

| Bestand | Wat erin staat |
| --- | --- |
| `src/vehicles.js` | De klasse `Vehicles` (zelfde naam, methodes en velden als voorheen). Rijgedrag, verkeer en botsingen zijn ongewijzigd. Nieuw: losse auto's met draaiende wielen, lampen en bestuurder, en de bundels voor geparkeerde auto's. |
| `src/carmodel.js` | Bouwstenen: `Buf` (verzamelt driehoeken), `Shell` (de loft), `patch` (lapje over een schil), wiel, stoel, stuur, bestuurder. |
| `src/cartypes.js` | De modellen zelf: maten per type, kap met ruiten, lampen, grille, naden, interieur, en de tractor. |
| `src/carmat.js` | Materialen: lak, details, glas, lampen, kentekenatlas en de textuur van de lichtvlek. |
| `tools/auto-test.html`, `tools/auto-test.js` | Losse testpagina met alleen een grondvlak, lucht en auto's. |
| `tools/auto-shots.cjs` | Maakt beelden op de testpagina (per type, dag en nacht, of een rij gebundelde auto's met `RIJ=1`). |
| `tools/auto-game.cjs` | Controle in de echte game: fouten, geparkeerde auto's, instappen en rijden met de Volvo, verkeer, lampen, en de meting. |

`src/quality.js` zat nog niet in mijn tak. Ik heb het bestand uit de hoofdmap gekopieerd om te kunnen bouwen,
maar het bewust NIET meegecommit. Mijn tak bouwt dus pas na het samenvoegen (of met dat bestand erbij).
Ik gebruik alleen `Q.name` en `Q.laag`.

Poort 4182 was al bezet door de dev-server van een andere werkmap. Ik heb daarom 4189 (dev-server, testpagina)
en 4190 (preview van de build) gebruikt. De scripts lezen de poort uit `URL=...`.

## Hoe de modellen zijn opgebouwd

- **Carrosserie als loft.** Een `Shell` is een rij dwarsdoorsneden langs de lengte-as. Elke doorsnede heeft een
  bovenkant (kwart superellips: motorkap, schouder), een zijkant met een eigen breedteprofiel (schouder, een vouw,
  een lichte holling, dorpel) en een onderkant. Hoogte van de bovenlijn, bodemlijn, breedte, afronding en
  bolling komen uit een paar vloeiende krommen per type. De breedte in bovenaanzicht loopt bij neus en kont
  rond af (superellips), zodat de hoeken bol zijn. Normalen komen uit de vorm zelf, niet uit de driehoeken:
  daardoor is alles vloeiend.
- **Wielkasten zijn echte uitsparingen.** Langs elke boog staan de stations op de hoeken van de cirkel en houden
  de rijen van de zijkant op bij de rand. Daarachter zit een donkere binnenkant met binnenwand, plus een
  kleine omgezette rand. Rond de boog wordt de carrosserie iets uitgebouwd.
- **Kap met ruiten** is een tweede schil, helemaal van glas. Dak, A-, B- en C-stijlen, dakrand en het paneel onder
  de achterruit zijn lapjes die er een paar millimeter overheen liggen (met een binnenkant, zodat je van binnen
  geen gaten ziet). In het dek van de carrosserie zit onder de ruiten een opening met een kuip: vloer,
  deurpanelen, dashboard met scherm, stuur, middenconsole, stoelen met hoofdsteunen, achterbank, binnenspiegel.
- **Lapjes** (`patch`) liggen precies op het oppervlak: koplampen, achterlichten, grille, mistlampen, zwarte
  bekleding, portiernaden, motorkapnaad, ruitenwissers, sierlijst. Rond neus en kont hebben ze als maat
  'afstand langs de omtrek' en 'hoogte', zodat lampen vanzelf om de hoek lopen. Hun hoekpunten vallen samen met
  de stations van de carrosserie eronder, zodat een lapje nooit door de ronding heen snijdt.
- **Per type**: hatchback (vijfdeurs, staafantenne), sedan (chroom, twee uitlaten, lichtbalk), SUV (zwarte
  bekleding, dakrails, donker glas achter), bestelbus (dichte zijwand en achterdeuren, tussenschot, stalen velgen
  met dop), sportwagen (laag, brede heupen, spoilerrand, zwarte velgen, rood interieur) en de Volvo XC40.
- **Volvo XC40**: zwart dak met zwarte A-stijlen en spoiler, de knik omhoog in de gordellijn achter met de brede
  stijl in de lak, zwarte wielkasten, dorpels en bumperranden met zilveren beschermplaat, grille met staafjes,
  chromen lijst, schuine streep en rond embleem met pijl, koplampen met de liggende hamer als dagrijlicht, hoge
  achterlichten langs de achterste stijl met een voet op de klep, turbinevelgen (vijf gezwenkte spaken,
  gepolijst op zwart), zilveren dakrails, haaienvin, kenteken `R-038-GP` (verzonnen).
- **Tractor**: afgeronde motorkap met grille en zijroosters, cabine met glas rondom, stijlen, wit dak, stoel en
  stuur, gebogen spatborden, uitlaatpijp met kapje, luchtfilter, spiegels, zwaailamp, trekhaak, grote
  achterwielen en kleinere voorwielen met noppen in visgraat en gele velgen.
- **Wielen**: band als omwentelingslichaam met wang, schouder en loopvlak met twee groeven, velgrand en velgbed,
  spaken per type (vijf brede, tien dunne in paren, zes stevige, wieldop, Y-spaken, turbine), naafdop met
  wielbouten, remschijf met naaf en een achterplaat.
- **Lak**: `MeshPhysicalMaterial` met heldere laklaag. De basislaag krijgt van dichtbij fijne metaalschilfers (een
  kleine verstoring van de normaal per korrel; de laklaag erboven blijft glad). Kleur per auto via `mat.color`
  of `instanceColor`, zoals voorheen. Het eerste kind van een losse auto blijft de lak (missies passen dat
  materiaal aan voor de gouden bolide).
- **Glas**: doorzichtig, getint, geen diepte schrijven, voorvermenigvuldigd mengen: de tint dekt de achtergrond
  af, de spiegeling telt er volledig bij op, en schuin gezien spiegelt het sterker. Geen `transmission` (dat
  tekent de hele scène een tweede keer). Achter de B-stijl donkerder glas bij SUV, Volvo en sportwagen.
- **Spiegeling**: `scene.environmentIntensity` staat in de game laag (0,38). Lak en glas versterken de spiegeling
  daarom zelf (`SPIEGEL_LAK`, `SPIEGEL_GLAS` in `carmat.js`). Omdat de omgevingskaart alleen lucht bevat, wordt
  de spiegeling zwakker naarmate de gespiegelde richting lager ligt (`HORIZON`): dat geeft een lichte bovenkant
  en donkerdere flanken. Als de omgeving in main.js feller of anders wordt, moeten deze getallen mee.
- **Lampen**: één materiaal met per hoekpunt een soort (dimlicht, dagrijlicht, achterlicht, remlicht, achteruit,
  knipperlicht, kenteken). Het materiaal weet per auto of de lampen aan zijn, of er geremd wordt, of de auto
  achteruit rijdt en of er geknipperd wordt. Felheid boven 1, zodat de gloed van de nabewerking het oppakt.
  Verkeer en de auto waarin je rijdt hebben de lampen aan (overdag dagrijlicht, 's avonds dimlicht en
  achterlicht). Geparkeerde auto's hebben de lampen uit; alleen de Volvo houdt 's avonds stadslicht.
  Remlicht gaat aan bij remmen (speler) of afremmen en stilstaan (verkeer), achteruitrijlicht bij achteruit,
  knipperlicht bij verkeer in een bocht. De kentekenplaat is 's avonds zwak verlicht.
- **Lichtbundel**: elke losse auto heeft een plat vlak voor de neus met een lichtvlek (opgeteld bij het beeld).
  De auto van de speler krijgt daarnaast één echte `SpotLight` (niet op 'laag'). Die staat altijd in de scène
  met sterkte 0, zodat aan- en uitgaan geen shaders opnieuw laat bouwen.
- **Kentekens**: een atlas van 14 verzonnen gele platen (canvas). De platen zitten in het lampmateriaal;
  welke plaat een auto heeft komt uit een eigenschap per auto (los) of per exemplaar in de bundel.
- **Bewegen**: bij losse auto's draaien de wielen met de afgelegde weg (per wiel de juiste straal, dus bij de
  tractor draaien de voorwielen sneller) en sturen de voorwielen mee. De vier wielen zijn samen één gebundelde
  mesh. In verkeersauto's zit een eenvoudige bestuurder; als je zelf rijdt zit er een bestuurder met een geel
  shirt. Dit loopt mee in `updateTraffic` (die elke stap wordt aangeroepen), dus main.js hoefde niet te wijzigen.

## Kwaliteitsstanden

Er zijn drie detailniveaus van hetzelfde model: 0 (volledig), 1 (lichter, nog met doorzichtig glas en
interieur) en 2 (eenvoudig: ondoorzichtig glas, geen interieur, wielen vast in de details).

| Stand | Losse auto's | Geparkeerde auto's (gebundeld) |
| --- | --- | --- |
| hoog | niveau 0 | binnen 13 m niveau 0, tot 50 m niveau 1, daarbuiten niveau 2 (voorbij 100 m zonder schaduw) |
| midden | niveau 0, verkeer niveau 1 | binnen 32 m niveau 1, daarbuiten niveau 2 (voorbij 85 m zonder schaduw) |
| laag | niveau 2 | alles niveau 2 (voorbij 70 m zonder schaduw) |

De afstanden staan in `TIERS` bovenaan `src/vehicles.js`.

De bundels worden vier keer per seconde opnieuw verdeeld als de camera meer dan 2 m is verplaatst, met een
marge van 15% zodat een auto op de grens niet heen en weer springt. Lege bundels worden niet getekend.

## Aantallen driehoeken

Gemeten met `tools/auto-game.cjs` (staat ook in `game/meting-hoog.json`). 'Los' is een hele auto met vier wielen.

| Type | Oud model | Niveau 0 (los, hoog) | Niveau 1 (bundel dichtbij) | Niveau 2 (ver weg, telefoon) |
| --- | ---: | ---: | ---: | ---: |
| hatch | 784 | 18.246 | 6.718 | 1.668 |
| sedan | 776 | 18.832 | 6.980 | 1.696 |
| suv | 796 | 19.082 | 7.026 | 1.836 |
| van | 744 | 19.386 | 6.982 | 1.684 |
| sport | 772 | 18.110 | 6.630 | 1.720 |
| tractor | 664 | 6.206 | 4.138 | 1.170 |
| xc40 | 3.104 | 20.022 | 7.492 | 1.846 |

Verdeling bij de Volvo op niveau 0: lak 5.956, details (ook interieur) 6.030, glas 1.500, lampen 440,
wielen 6.096. Met bestuurder erbij komt een rijdende auto rond de 21.000 uit.

Alle modellen bouwen kost in de test bij elkaar enkele tientallen milliseconden (gemeten: 21 tot 60 ms voor
de modellen die bij de start nog niet gebouwd waren); modellen worden pas gebouwd als ze nodig zijn.

## Tekenopdrachten

- Losse auto: lak, details, lampen, glas, wielen (één gebundelde mesh), plus bestuurder als er iemand in zit en
  de lichtvlek als de lampen aan zijn en het donker is. Dat is 5 tot 7. Op 'laag' 3 (plus de lichtvlek 's avonds).
- Geparkeerde auto's: per type en per afstandstrap 4 (lak, details met wielen, lampen, glas), op het
  eenvoudige niveau 3.

## Gemeten in de game (SwiftShader, 800 x 450, stand hoog)

- 212 auto's in de lijst (waarvan de Volvo los), 11 verkeersauto's, geen fouten in de console.
- Eén beeld bij de Volvo: 4,51 miljoen driehoeken en 451 tekenopdrachten in totaal (alle stappen, ook schaduw).
  Zonder auto's: 4,08 miljoen en 411. De auto's zijn daar dus goed voor ongeveer 0,43 miljoen driehoeken en
  40 tekenopdrachten. Vóór ik de verste trap geen schaduw meer liet werpen was dat 0,78 miljoen.
- Op 'laag' (telefoonformaat) mat ik eerder ongeveer 0,33 miljoen driehoeken en 33 tekenopdrachten voor de
  auto's. Die meting is van vóór de trap zonder schaduw; de herhaling daarna is afgebroken (zie onderaan).
- Instappen in de Volvo en gas geven: in 45 stappen 6,43 m verplaatst, de wielen 17,87 radialen gedraaid
  (6,43 m gedeeld door de wielstraal 0,36 m), lampen aan, bestuurder zichtbaar. Remmen zet het remlicht aan.
- Verkeer: alle 11 auto's bewogen, lampen aan, bestuurder zichtbaar.
- Een geparkeerde auto activeren haalt hem uit de bundel (29 naar 28) en je zit erin.
- De hele speltest is ook gedraaid op 'midden' (zonder fouten, zelfde uitkomsten) en op 'laag' (zonder fouten:
  rijden, verkeer en activeren werkten; op 'laag' is er geen bestuurder en geen echte lamp, dat is de bedoeling).

## Wat ik heb geprobeerd en teruggedraaid of aangepast

- **Diepteverschuiving naar helling** (`polygonOffsetFactor 1`) op de lak, zodat lapjes er altijd voor liggen.
  Bij schuin kijken op afstand schoof de lak daardoor centimeters weg en werden daken zwart (het ondoorzichtige
  glas won). Vervangen door alleen een vaste verschuiving (`factor 0, units 3`).
- **Dak als lapje op het eenvoudige model**: gaf op afstand twee vlakken vlak boven elkaar. Op niveau 2 zit het dak
  (en bij de bestelbus de dichte wand) nu in de schil zelf.
- **Ronde onderrand van de voorruit** (brede superellips): gaf een 'badkuiprand' van glas rond de voet van de ruit.
  Nu een bijna rechte onderrand en een grotere afronding naar de A-stijlen.
- **Lapjes met een gelijkmatige verdeling rond de neus**: bij de grovere modellen sneden die door de ronding en
  kwam de lak er als tanden doorheen. Nu vallen de hoekpunten samen met de stations van de carrosserie.
- **Glas met het gewone diffuse licht**: werd melkachtig (het randlicht uit lighting.js telt daarin mee). Het glas
  gebruikt nu alleen het omgevingslicht plus de spiegeling.
- **Witte lenzen**: de dimlichtlenzen waren overdag felwitte schijven. Ze zijn overdag nu donker glas en geven
  's nachts wel wit licht.
- **Felheid 's nachts**: dimlicht 9 en remlicht 9 gaven een uitgebeten gloed. Nu 5,5 en 5.
- **Buitenspiegel als bol**: zag er niet uit. Nu een afgeronde kap op een voet met een spiegelglas.
- **Achterlichten als gekleurde blokken**: speelgoedachtig. Nu een donkerrode lens met lichtlijnen en een lenskap.
- **Twee bundels per type** (dichtbij en ver): auto's waar je naast staat waren dan het lichtere model. Nu drie trappen.
- **Eigen tekenvolgorde voor glas** (`renderOrder`): weggehaald, three sorteert doorzichtige dingen zelf op afstand.
- Een fout die ik zelf maakte en herstelde: de C-stijl dekte maar de halve hoogte (bij de sedan liep het glas
  om de hoek door).

## Wat nog beter kan en wat niet is getest

- **Niet getest op een echte videokaart of telefoon.** De aantallen kloppen, maar of 0,8 miljoen driehoeken voor
  auto's op 'hoog' soepel loopt weet ik niet. Gebundelde auto's worden niet per stuk weggelaten als ze buiten
  beeld zijn (dat was al zo): de verre bundel wordt altijd helemaal getekend, ook in de schaduwstap. Als dat te
  zwaar blijkt: de afstanden in `TIERS` (vehicles.js) omlaag, of de verre bundel geen schaduw laten werpen.
- **Overgang op 50 m**: het verre model heeft ondoorzichtig donker glas, het nabije doorzichtig glas met interieur.
  Die wissel is te zien als je erop let.
- **De lichtvlek** is een plat vlak dat met de auto meekantelt: op een helling kan hij in de grond verdwijnen of
  erboven zweven. De echte lamp van de speler kost een extra lamp in alle materialen (ook overdag, met sterkte 0).
- **'s Nachts** is er in de game geen omgevingskaart: lak en glas krijgen dan alleen maanlicht en de eigen
  lampen, dus auto's zijn donker. Dat hoort bij de belichting, niet bij de auto's.
- **De XC40** is herkenbaar aan de onderdelen, maar de vorm is die van mijn algemene SUV-schil met eigen maten.
  Fijne dingen als de holle grille, de C-vormige holling in de portieren en letters op de klep ontbreken.
- **Vormen**: per type een handvol krommen. Scherpe lijnen (behalve de vouw onder de schouder), luchthappers,
  deurstijlen in het portier en dergelijke zitten er niet in. De vlakke kop achter grille en kenteken is als
  een licht paneel te zien op de klep en boven de grille.
- **Wielen van geparkeerde auto's** staan stil en recht (zoals gevraagd). Remklauwen ontbreken. Het loopvlak heeft
  alleen groeven in de rijrichting.
- **Bestuurder**: een eenvoudig poppetje, voor de speler altijd met geel shirt en donker haar. Geen passagiers.
- **Knipperlichten**: alleen bij verkeer in een bocht, niet bij de speler.
- **Stand 'midden'**: draait zonder fouten in de speltest, maar ik heb er geen aparte beelden van bekeken.
  De 'midden' van main.js zat nog niet in mijn tak; alleen mijn eigen code reageerde op `?kwaliteit=midden`.
- **Laatste wijziging niet volledig nagelopen op 'laag'**: na het toevoegen van de verste trap zonder schaduw is
  de speltest op 'hoog' opnieuw helemaal goed gegaan. De herhaling op 'laag' is halverwege afgebroken doordat de
  machine herstartte (geheugen). De beelden `game/*-laag.jpg` komen uit die afgebroken run (tot en met het
  rijden 's avonds); een `meting-laag.json` ontbreekt daardoor.
- **De lichtvlek op 'laag'** (ik heb hem daar als laatste toegevoegd) heb ik niet apart in beeld bekeken.
- **Schaduw**: glas werpt geen schaduw, dus in de schaduw van een auto zie je de ruiten als lichte vlekken.
- **Geen vuil, schade of regen** op de lak.

## Beelden

- `voor/`: het oude model op de testpagina (alle types, dag; Volvo en hatchback ook 's nachts).
- `na/`: het nieuwe model op dezelfde testpagina met dezelfde standpunten.
- `game/`: beelden uit de echte game (stand hoog): geparkeerde auto's, de Volvo op de oprit, rijden overdag en
  's avonds, verkeer.
