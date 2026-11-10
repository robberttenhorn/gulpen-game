# Poppetjes in de HD-versie: notities

Dit hoort bij de wijzigingen in `src/character.js`, `src/mocap.js`, `src/mocap-data.js` en de hulpmiddelen in `tools/`
(`bake-mocap.mjs`, `mocap-lib.mjs`, `poppetje-test.html`, `poppetje-test.js`, `poppetje-shots.cjs`, `poppetje-spel.cjs`).
Alles hieronder is wat er echt gedaan en gemeten is. Er was geen videokaart: alle beelden zijn gemaakt met
software-rendering (Chromium met SwiftShader), dus over de beeldsnelheid op een echte computer of telefoon staat hier niets.

## Wat er is veranderd

### 1. Echte motion capture voor lopen, joggen, rennen en zitten

- `tools/bake-mocap.mjs` haalt vier opnamen uit de CMU-database op, knipt er een naadloze lus uit en rekent die om
  naar het skelet van de poppetjes (17 botten). Het resultaat staat als kleine JS-module in `src/mocap-data.js`
  (25 kB, geen laadmoment, geen async). `public/data/mocap/` is daardoor niet nodig en bestaat niet.
- `src/mocap.js` pakt de clips uit en mengt ze. `character.js` gebruikt ze in de modes `walk`, `idle`, `wave`,
  `push` (lopen en rennen) en `sit`.
- Gebruikte opnamen (proefpersoon_opname, omschrijving uit het indexbestand van de BVH-uitgave, en wat ik zelf mat):

  | clip in de game | CMU-opname | omschrijving in de index | wat erin zit (gemeten) | uitgeknipt |
  |---|---|---|---|---|
  | `walk` | 35_01 | walk | rechtuit lopen, 1,29 m/s, 2,99 s | één dubbele stap van 1,123 s, 34 frames |
  | `jog` | 35_17 | run/jog | rechtuit joggen, 3,18 m/s, 1,40 s | één dubbele stap van 0,750 s, 28 frames |
  | `run` | 09_01 | run | rechtuit rennen, 3,63 m/s, 1,24 s | één dubbele stap van 0,733 s, 26 frames |
  | `sit` | 14_31 | sit on stepstool, stand up | lopen, gaan zitten op een krukje, opstaan (twee keer), 17,5 s | rustig zitten van 2,9 tot 6,7 s, 38 frames |

- Retargeten (in `bake-mocap.mjs`, bovenaan het bestand staat het stap voor stap): per frame de wereldrotatie van
  elk mocap-segment uitrekenen met voorwaartse kinematica en die aan het bijpassende bot van het poppetje geven,
  zo omgerekend dat de richting van elk botsegment klopt (het poppetje heeft de armen in rust omlaag, de mocap
  opzij). Daarna terugrekenen naar rotaties ten opzichte van het ouderbot en opslaan als quaternions (16 bits).
- Het poppetje kijkt naar +Z en heeft zijn 'L'-botten aan de kant van -X; in de mocap zit links aan +X. Ik koppel
  op plaats (zelfde kant van het lichaam), dus mocap-links stuurt de 'R'-botten. Er wordt niets gespiegeld.
- Lus sluiten: de cyclus loopt van het moment dat de enkels elkaar passeren tot de volgende keer. Het verschil
  tussen begin en eind (lopen 7,3 graden op het slechtste bot, joggen 5,8, rennen 13,6, zitten 12,9) wordt
  gelijkmatig over de hele lus uitgesmeerd.
- Voeten op de grond: de benen van de proefpersoon zijn links en rechts niet even lang (in het BVH-skelet), die van
  het poppetje wel. Zonder correctie zweefde de laagste zool tijdens het lopen tot 4,1 cm. Nu wordt per frame de
  hoogte van het lichaam bijgesteld zodat de zool van de standvoet op de grond staat (lopen: tussen -0,2 en +0,4 cm).
- Hoofd en nek: de T-houding in frame 0 van de BVH is een schatting van de maker van de omzetting. Daarmee keek
  het hoofd bij joggen 11 graden en bij rennen 18 graden omhoog. Daarom ijk ik op de beweging zelf: gemiddeld over
  de cyclus kijkt het hoofd 4 graden omlaag en staat de nek 6 graden naar voren.
- In de game: de fase van de cyclus loopt met afgelegde afstand gedeeld door de staplengte. Tot 2 m/s lopen,
  tussen 2 en 3 m/s een overgang naar joggen, tussen 4,6 en 5,8 m/s naar rennen. Sneller dan de opname betekent
  deels grotere passen en deels een hoger tempo (macht 0,35 voor lopen, 0,25 voor joggen, 0,3 voor rennen).
  Langzamer dan 0,75 m/s worden de passen kleiner (mengen met stilstaan).
- Schuiven van de standvoet, gemeten op de testpagina (`window.slip`, snelheid van de bal van de voet terwijl hij
  op zijn laagste punt is; dezelfde meting op de oude versie):

  | snelheid | oud | nieuw |
  |---|---|---|
  | 0,9 m/s | 1,87 m/s | 0,10 m/s |
  | 1,3 m/s | 1,9 tot 2,0 m/s | 0,04 m/s |
  | 1,6 m/s | 1,7 tot 2,0 m/s | 0,14 tot 0,15 m/s |
  | 2,5 m/s | 2,3 tot 2,7 m/s | 0,21 tot 0,25 m/s |
  | 4,0 m/s (speler) | 2,9 tot 3,0 m/s | 0,44 tot 0,55 m/s |
  | 6,5 m/s (sprint) | 1,1 m/s | 1,4 tot 2,2 m/s |

  De meting is grof (bij rennen telt ook het neerkomen en afzetten mee), maar het verschil bij loopsnelheid is
  duidelijk. Bij de sprint is het niet beter dan vroeger: zie 'Wat nog beter kan'.
- Fietsen zit niet in de CMU-database (in de index staat alleen 'motorcycle pose'). Fietsen is daarom berekend
  gebleven, maar wel opnieuw gemaakt: zie punt 3.

### 2. Realistischer lichaam (nog steeds alles in code, één SkinnedMesh, vertexkleuren)

- Romp met borstkas, taille, bekken en billen; een afgeronde rechthoek als doorsnede in plaats van een ellips.
- Schouders die in de arm overlopen, hals met aanzet naar de schouders, kuiten, knieën, smalle enkels.
- Hoofd uit ringen met een kaaklijn en kin, oren, een neus met vleugels, ogen met iris, pupil en bovenooglid,
  lippen, wenkbrauwen. Vrouwen hebben een smallere kaak; een stevige bouw geeft een bredere.
- Handen met een handpalm, vier licht gebogen vingers en een duim.
- Schoenen met een bovenkant en een aparte zool.
- Kleding met volume: boord, zoom van het shirt los over de broek, zoom van de mouw, broekspijp die over de
  schoen valt (met een enkel eronder die je ziet als de pijp omhoog komt), kraag en dikkere mouwen bij een jas.
- Haar en baard zijn een laagje over de schedel: waar geen haar hoort, zit het laagje binnenin. Lang haar valt
  over de schouders en de rug en beweegt onderaan met nek en romp mee.
- Bouw: tenger tot stevig (breedte van romp en ledematen, een buikje), vast afgeleid van de kleuren van het
  poppetje, dus dezelfde persoon ziet er altijd hetzelfde uit. De speler komt uit op 0,07 (gemiddeld). Er is
  één nieuwe, optionele instelling `build` (-1 tot 1) om het zelf te kiezen; alle bestaande opties werken zoals
  voorheen. De lengte loopt nog steeds via `scale`.
- Skelet, botnamen, `userData.parts`, `handOffset`, `handProp`/`holdR` en de totale lengte zijn gelijk gebleven.
- Gewicht (standaardpoppetje): 5768 driehoeken, was 3662. Op telefoons (`Q.laag` uit `src/quality.js`) een
  eenvoudiger model met minder vlakjes rondom, wanten in plaats van losse vingers en zonder oogleden:
  3662 driehoeken, evenveel als vroeger. Bouwen kost 2 tot 5 ms per poppetje, één animatiestap minder dan
  0,02 ms (gemeten in deze omgeving, op de processor).
- Poppetjes buiten beeld worden niet meer getekend: het model heeft nu een vaste, ruime omhullende bol
  (vroeger stond het uitschakelen daarvan aan).

### 3. Fietsen, stilstaan en de overgangen

- Fietsen: het bekken komt op het zadel, de voeten staan op de trappers en de handen aan het stuur. Benen en
  armen worden per beeld uitgerekend uit die drie punten, dus de voeten maken echte rondjes. De trapas met
  cranks en trappers van de fiets draait mee.
- `makeBike` maakt nu een stadsfiets (frame, spatborden, bagagedrager, kettingkast, lamp, stuur met de
  handvatten naar achteren) in twee tekenopdrachten in plaats van zeven. De wielen staan op dezelfde plek en
  het zadel op dezelfde hoogte als voorheen. `bike.userData.fiets` vertelt het poppetje waar zadel, trapas en
  handvatten zitten; het poppetje zoekt een fiets met hetzelfde ouderobject (zo is het bij de speler, de
  fietsers en de wielrenner van de race). Staat er geen fiets van `makeBike` naast (de hometrainer in de
  sportschool), dan gebruikt het een standaardhouding.
- Stilstaan: gewicht op één been, af en toe wisselen, ademen, rondkijken. Dit is berekend, geen mocap.
- Wissel van houding: het verschil met de vorige houding dooft in een fractie van een seconde uit, in plaats
  van dat elke houding blijvend wordt uitgevlakt. Daardoor wordt de mocap zelf niet afgezwakt.
- Zwaaien, iets vasthouden, eten, drinken, camera, duwen en skaten zijn inhoudelijk hetzelfde gebleven en
  liggen als laag over de mocap. Het van buitenaf zetten van `parts.armL.rotation.x` na `animate` (polonaise,
  bicepscurls in de sportschool) werkt nog: gecontroleerd op een contactvel.

## Bronnen en licentie

- Motion capture: Carnegie Mellon University, CMU Graphics Lab Motion Capture Database, http://mocap.cs.cmu.edu
- BVH-omzetting: Bruce Hahne (cgspeed.com), 'Motionbuilder-friendly BVH conversion release', uitgave 2010
  (READMEFIRST v1.1, 26 juni 2010).
- Opgehaald van GitHub, repository `una-dinosauria/cmu-mocap` (een kopie van die BVH-uitgave):
  - https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/035/35_01.bvh
  - https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/035/35_17.bvh
  - https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/009/09_01.bvh
  - https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/014/14_31.bvh
  - https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/READMEFIRST.txt (licentietekst)
  - https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/cmu-mocap-index-text.txt (omschrijvingen)
- Licentietekst, letterlijk uit READMEFIRST.txt in die repository (de website van CMU zelf heb ik niet opgehaald):

  > USAGE RIGHTS:
  >
  > CMU places no restrictions on the use of the original dataset, and I (Bruce) place no additional
  > restrictions on the use of this particular BVH conversion.
  >
  > Here's the relevant paragraph from mocap.cs.cmu.edu:
  >
  > Use this data! This data is free for use in research and commercial projects worldwide. If you publish
  > results obtained using this data, we would appreciate it if you would send the citation to your published
  > paper to jkh+mocap@cs.cmu.edu, and also would add this text to your acknowledgments section: "The data
  > used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF
  > EIA-0196217."

- De BVH-bestanden zelf staan niet in deze repository. De bakker bewaart ze in `node_modules/.cache/cmu-mocap/`;
  in de repository staat alleen het omgerekende resultaat (`src/mocap-data.js`).
- Verder is er niets opgehaald: geen modellen, geen texturen. MakeHuman en Mixamo zijn niet gebruikt.

## Wat ik heb geprobeerd en teruggedraaid of bijgesteld

- Andere opnamen bekeken maar niet gebruikt (alleen duur, snelheid en heuphoogte gemeten): 35_02, 35_20, 09_05,
  16_35, 16_55, 07_12, 08_01, 13_01, 13_04, 13_05, 14_27, 15_10, 18_12, 22_02. Voor zitten viel de keus op 14_31
  omdat de proefpersoon daar ruim vier seconden rustig zit met de bovenbenen ongeveer horizontaal; 13_01 en
  15_10 zijn een hoge kruk, 13_04 heeft de kin in de hand.
- De eerste versie van de bakker koos de tweede cyclus van elke clip; 35_01 bleek maar één hele cyclus in die
  richting te hebben. Nu kiest hij de cyclus die het meest in het midden van de clip ligt.
- Staplengte bij hogere snelheid: eerst macht 0,4 (lopen) en 0,6 (joggen, rennen). Dat gaf bij 4 m/s en 6,5 m/s
  te veel schuiven; nu 0,35, 0,25 en 0,3 (dus vooral een hoger tempo).
- De vaste uitvlakking van elke houding (zoals in de oude code) is vervangen door het uitdoven van het verschil
  bij een wissel, omdat de uitvlakking de snelle beweging van het rennen zou afzwakken en vertragen.
- Lichaam, eerste poging: te spitse kin, schouders als bolletjes, haar dat door de pet stak, een rafelige zoom
  waar de bovenbenen door het shirt staken, een shirt dat bij de schouders onder de jas uit kwam, een jasje dat
  als een cape uitwaaierde. Allemaal bijgesteld; de zoom beweegt nu aan de zijkant licht met de bovenbenen mee.
- Fiets, eerste poging: de spatborden stonden gedraaid (het voorste hing voor onder het wiel). Hersteld.
- MakeHuman als basis heb ik niet geprobeerd: de opbouw in code leverde binnen de beschikbare tijd al een
  bruikbaar lichaam op, en een los model had laden, omrekenen naar dit skelet en nieuwe huidgewichten gevraagd.

## Wat nog beter kan

- Sprint (6,5 m/s): de snelste opname is 3,63 m/s. Het tempo gaat omhoog en de passen worden opgerekt, waardoor
  de standvoet tijdens het korte contact nog 1,4 tot 2,2 m/s schuift. Een echte sprintopname zou dit oplossen.
- Tussen 2 en 3 m/s is de beweging een mengsel van lopen en joggen. De speler komt daar alleen even doorheen bij
  het optrekken.
- De speler beweegt standaard met 4 m/s; dat is hardlooptempo, dus het poppetje jogt. Echt wandelen zie je bij
  de voetgangers en met een half ingedrukte joystick.
- Zitten: de opname is op een krukje zonder leuning, dus iemand op een bankje leunt iets voorover en niet tegen
  de leuning. De voeten van de mensen op de bankjes hangen ongeveer 7 cm boven de grond (vroeger ongeveer 10):
  de zithoogte komt uit `pedestrians.js` (0,19 m erbij) en die heb ik niet aangeraakt.
- Stilstaan is berekend. Een mocap-opname van staan en wachten zou levendiger zijn.
- De schoen is star (geen teengewricht) en de vingers bewegen niet: een voorwerp zit in een ontspannen hand.
- Gezichten zijn neutraal: geen knipperen, geen mondbeweging.
- De hometrainer in de sportschool gebruikt de standaardhouding; de handen komen daar niet precies op het stuur.
- Het spel is alleen getest in deze worktree (zonder de andere HD-wijzigingen) op 800 bij 450 pixels met
  software-rendering: geen fouten in de console; de speler loopt, jogt, rent, fietst en skatet;
  dorpsbewoners zwaaien; iemand zit op een bankje; voetgangers en een fietser bewegen (zie `spel-overzicht.jpg`).
  Niet getest: de minispellen, de interieurs en de missies zelf.
- `character.js` leest de kwaliteitsstand met `import.meta.glob('./quality.js')`, omdat `src/quality.js` in
  deze worktree niet bestond. Na het samenvoegen mag dat een gewone `import { Q } from './quality.js'` worden.

## Opnieuw maken en controleren

```
node tools/bake-mocap.mjs                      # clips ophalen en src/mocap-data.js schrijven (--info: alleen meten)
npx vite --port 4182 --strictPort &            # testpagina: http://localhost:4182/tools/poppetje-test.html?mode=walk&speed=1.3
node tools/poppetje-shots.cjs <map> <naam>     # contactvellen en metingen (LAAG=1 ervoor: het telefoonmodel)
npx vite build && npx vite preview --port 4181 --strictPort &
node tools/poppetje-spel.cjs <map>             # de poppetjes in de echte game
```

## Beelden in deze map

- `voor-*.jpg` en `na-*.jpg`: contactvellen van de testpagina, acht fasen naast elkaar, boven van opzij en onder
  van voren (lopen 1,3 m/s, speler 4 m/s, rennen 6,5 m/s, zitten, fietsen, zwaaien) en rijen poppetjes met
  verschillende kleding (`rij-voor`, `rij-schuin`, `hoofden`, `handen`).
- `telefoon-rij-schuin.jpg`: het eenvoudige model voor telefoons.
- `spel-overzicht.jpg`: negen beelden uit de echte game (stilstaan, lopen, rennen, fietsen, skaten, de monteur
  met gereedschap in de hand, iemand op een bankje, een voetganger met een tas, een fietser). Op de achtergrond
  van het renbeeld (Prins Carnaval) en het fietsbeeld (de verdwaalde toerist) zwaait een dorpsbewoner.
