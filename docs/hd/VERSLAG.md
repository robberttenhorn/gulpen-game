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
