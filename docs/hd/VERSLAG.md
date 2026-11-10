# Verslag HD-proefversie Locals: Gulpen

> Dit verslag wordt per stap bijgewerkt en meegepusht. Alles wat hier staat is echt gedaan en gemeten.

## Samenvatting

(wordt aan het eind ingevuld)

## Plan

Volgorde: van het meeste visuele effect naar het minste. Elke stap wordt gebouwd, getest, bekeken en gepusht.

1. **Nulmeting**: screenshots van de bestaande game in `docs/hd/voor/` en een meting.
2. **Kwaliteitsstanden**: `hoog` (computer), `midden` en `laag` (telefoon), gekoppeld aan de bestaande automatische regeling (`adaptQuality`).
3. **Lucht, licht en atmosfeer**: fotografische lucht (HDRI van Poly Haven) voor dag en nacht, die ook het hemellicht en de reflecties levert; zon en schaduw opnieuw afgesteld; grotere, stabiele schaduwkaart; hoogtemist en luchtperspectief.
4. **Nabewerking**: eigen keten met ambient occlusion, zonnestralen, scherptediepte in gesprekken, bloom, filmische tone mapping, kleurcorrectie, vignet en korrel.
5. **Materialen van de wereld**: wegen en stoepen (fijnere fototexturen, natte plekken met reflectie), water, gras en akkers, gevels en daken.
6. **Begroeiing**: gras dat je echt ziet staan, vollere bomen en hagen, licht door het blad.
7. **Poppetjes**: realistischer lichaam en bewegingen uit echte motion capture (Carnegie Mellon University).
8. **Auto's**: carrosserie met rondingen, glas met interieur, wielen, lampen.
9. **Straatmeubilair en details**: lantaarns met lichtkegels, gloed van ramen, kleine dingen in het dorp.
10. **Afronding**: missies nalopen, beeldsnelheid, README, bronnenlijst, dit verslag.

## Keuzes vooraf

- **WebGL blijft de hoofdroute, geen WebGPU.** De hele game hangt aan eigen GLSL-shaders die in de materialen van three.js zijn ingebouwd (gevels met ramen en kamers, terrein met luchtfoto, randlicht en mist in `lighting.js`, bomen, water). De WebGPU-renderer van three.js gebruikt een ander shadersysteem (TSL); overstappen betekent al die shaders opnieuw schrijven en opnieuw testen, zonder dat het beeld er op zichzelf mooier van wordt. In één nacht, zonder videokaart om WebGPU op te testen, is dat een te groot risico voor een game met ruim 50 missies. Alle verbeteringen hieronder werken op WebGL 2, dat op elke computer en telefoon draait.
- **Testen zonder videokaart.** De testomgeving heeft geen videokaart: Chromium tekent met software (SwiftShader). Eén beeld kost daar 4 tot 7 seconden. Gemeten tijden per beeld zijn dus alleen bruikbaar om versies met elkaar te vergelijken, niet als beeldsnelheid op een echte laptop of telefoon. Zie het hoofdstuk Beeldsnelheid.

## Stap 0: nulmeting

Screenshots van de bestaande game staan in `docs/hd/voor/` (computerformaat 1280x720, telefoonformaat 844x390 met pixelverhouding 2, telkens overdag en 's avonds). Gemaakt met `tools/hd-shots.cjs`, dat vaste standpunten gebruikt zodat elke stap precies hetzelfde beeld opnieuw kan maken.

Meting van de bestaande game (softwareweergave, zie Keuzes vooraf): computer 6,8 s per beeld, 3,6 miljoen driehoeken en 823 tekenopdrachten per beeld; telefoon 4,2 s per beeld, 2,9 miljoen driehoeken en 599 tekenopdrachten.

Er is ook een test die alle missies kort naloopt (`tools/hd-missies.cjs`): naar de persoon toe, het gesprek door, wachten tot het minispel of de opdracht begint, wat invoer geven en dan stoppen. Die test vond meteen een bestaande fout: de Gulpener Bierfeesten liepen vast op `hideTrees`, een functie die in deze kopie niet bestond. Die is toegevoegd in `src/world.js` (bomen rond het podium tijdelijk weghalen), en de missie werkt weer.

## Stap 1: kwaliteitsstanden, fotografische lucht, licht, atmosfeer en nabewerking

**Wat**
- `src/quality.js`: drie standen. `hoog` op de computer, `laag` op de telefoon, `midden` ertussenin. Kiezen kan met `?kwaliteit=hoog|midden|laag` (wordt onthouden, `?kwaliteit=auto` zet het terug). De automatische regeling (`adaptQuality`) schakelt nu stap voor stap af: eerst scherptediepte en zonnestralen, dan minder pixels, dan ambient occlusion, dan nog minder pixels, en pas als laatste de hele nabewerking.
- `src/sky.js` en `tools/fetch-hdri.py`: de lucht is nu een echte foto (HDRI van Poly Haven, CC0): overdag blauw met stapelwolken, 's nachts een sterrenhemel met de Melkweg. De koepel draait mee zodat de zon op de foto staat waar de zon in het spel staat. Dezelfde lucht levert het hemellicht en de reflecties in ramen, lak en water. Eerst laadt een lichte versie (2048 breed), op de computer daarna de fijne (4096 breed).
- Licht (`applyTime` in `src/main.js`): de zon is feller ten opzichte van het opvullicht (meer contrast tussen zon en schaduw), het opvullicht komt nu grotendeels van de echte lucht. De schaduwkaart is op de computer 4096 pixels over 170 meter (was 2048 over 120 meter), ligt vóór de speler in de kijkrichting en klikt vast op zijn eigen raster, zodat schaduwranden niet trillen als je loopt.
- Atmosfeer (`src/lighting.js`): de grijze mistwand is vervangen door luchtperspectief (verder weg trekt alles naar de kleur van de horizon) en hoogtemist (in het dal van de Gulp hangt meer nevel dan op de heuvels). De mistkleur komt van de horizon op de luchtfoto, dus het landschap loopt naadloos over in de lucht.
- Nabewerking (`src/post.js`): een eigen keten in plaats van de standaardketen van three.js, omdat de effecten de diepte van het beeld nodig hebben. Ambient occlusion uit de diepte (zachte schaduw in hoeken, onder auto's, langs stoepranden), zonnestralen als je richting de zon kijkt, scherptediepte tijdens gesprekken (de achtergrond wordt zacht), bloom, filmische tone mapping (ACES), kleurcorrectie met koele schaduwen en warme lichten, vignet, een beetje filmkorrel en een lichte kleurschifting aan de randen. Naambordjes worden na de nabewerking getekend, zodat ze scherp blijven.

**Waarom**: lucht, licht en nabewerking bepalen het hele beeld; al het andere (materialen, begroeiing, auto's) ziet er pas goed uit als dit klopt.

**Voor en na** (links de bestaande game, rechts na deze stap)

| | Voor | Na |
| --- | --- | --- |
| Rijksweg, dag | ![](voor/computer-dag-rijksweg.jpg) | ![](stap1/computer-dag-rijksweg.jpg) |
| Markt, dag | ![](voor/computer-dag-markt.jpg) | ![](stap1/computer-dag-markt.jpg) |
| Ringweg 38, dag | ![](voor/computer-dag-tuin38.jpg) | ![](stap1/computer-dag-tuin38.jpg) |
| Rijksweg, avond | ![](voor/computer-avond-rijksweg.jpg) | ![](stap1/computer-avond-rijksweg.jpg) |
| Markt, telefoon | ![](voor/telefoon-dag-markt.jpg) | ![](stap1/telefoon-dag-markt.jpg) |

**Meting** (softwareweergave): computer 7,6 s per beeld (was 6,8; tijdens deze meting draaiden er andere zware processen mee), telefoon 4,6 s (was 4,2). De telefoonstand heeft geen nabewerking; het verschil daar is ruis van de meting.

**Geprobeerd en aangepast**
- Tone mapping AgX in plaats van ACES: gaf een flets, grijzig beeld. Teruggezet naar ACES met een eigen kleurcorrectie erachter.
- De eerste lucht (Kloofendal 38d, half bewolkt met sluierwolken) had precies de goede zonnestand maar oogde grijs. Vervangen door Kloofendal 48d (blauw met stapelwolken). Daar staat de zon 10 graden hoger dan in het spel; in plaats van de zon in het spel hoger te zetten (dan worden de schaduwen korter en verdwijnt het lage, warme licht) wordt de foto in de hoogte iets opgerekt, zodat de zon op de foto op 37 graden staat.
- De eerste nachtinstelling was melkachtig (te veel bloom en mist die oplichtte richting de maan). Bloom en mist zijn 's nachts teruggeschroefd.
