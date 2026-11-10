# Bronnen van de HD-proefversie

Alles in deze lijst is opgehaald zonder account, met een licentie CC0, CC BY, MIT of publiek domein.
Wat niet in deze lijst staat (auto's, poppetjes, straatmeubilair, gras, bladtexturen, water, geluid) is in code gemaakt.

## Lucht (HDRI's)

Opgehaald en omgezet met `tools/fetch-hdri.py` (bron: de 4k-bestanden van `dl.polyhaven.org`). In de game staan alleen de omgezette JPG's (`public/data/sky/`).

| Bron | Gebruik | Makers | Licentie |
| --- | --- | --- | --- |
| [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | lucht overdag, ook voor hemellicht en reflecties | Greg Zaal, Jarod Guest | CC0 |
| [Qwantani Night (Pure Sky)](https://polyhaven.com/a/qwantani_night_puresky) | lucht s nachts, ook voor hemellicht en reflecties | Greg Zaal, Jarod Guest | CC0 |

## Fototexturen

Opgehaald met `tools/fetch-textures.py` (bestond al in de oorspronkelijke game). Bestanden in `public/data/tex/`.

| Bron (Poly Haven) | Gebruik | Makers | Licentie |
| --- | --- | --- | --- |
| [painted_plaster_wall](https://polyhaven.com/a/painted_plaster_wall) | gevel: pleisterwerk | Amal Kumar | CC0 |
| [sandstone_blocks_04](https://polyhaven.com/a/sandstone_blocks_04) | gevel: mergel | Rob Tuytel | CC0 |
| [red_brick](https://polyhaven.com/a/red_brick) | gevel: rode baksteen | Rob Tuytel | CC0 |
| [red_brick_03](https://polyhaven.com/a/red_brick_03) | gevel: bruine baksteen | Rob Tuytel | CC0 |
| [yellow_brick](https://polyhaven.com/a/yellow_brick) | gevel: gele baksteen | Rob Tuytel | CC0 |
| [grey_plaster](https://polyhaven.com/a/grey_plaster) | gevel: grijs pleister | Rob Tuytel | CC0 |
| [roof_slates_03](https://polyhaven.com/a/roof_slates_03) | dak: leien | Rob Tuytel | CC0 |
| [roof_tiles](https://polyhaven.com/a/roof_tiles) | dak: rode pannen | Stephan Seeliger | CC0 |
| [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles) | dak: antraciet pannen | Rob Tuytel | CC0 |
| [asphalt_02](https://polyhaven.com/a/asphalt_02) | plat dak | Rob Tuytel | CC0 |
| [clean_asphalt](https://polyhaven.com/a/clean_asphalt) | asfalt van rijbaan en fietspad | Dimitrios Savva | CC0 |
| [herringbone_pavement](https://polyhaven.com/a/herringbone_pavement) | klinkers | Charlotte Baglioni | CC0 |
| [concrete_tiles](https://polyhaven.com/a/concrete_tiles) | stoeptegels | Dimitrios Savva | CC0 |
| [concrete_pavers](https://polyhaven.com/a/concrete_pavers) | parkeervakken en erven | Amal Kumar | CC0 |

## Bewegingen van de poppetjes (motion capture)

- **Bron**: Carnegie Mellon University, CMU Graphics Lab Motion Capture Database, http://mocap.cs.cmu.edu. "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."
- **Gebruikt**: opnamen 35_01 (lopen), 35_17 (joggen), 09_01 (rennen) en 14_31 (zitten op een krukje, opstaan), in de BVH-omzetting van Bruce Hahne (cgspeed.com, uitgave 2010).
- **Opgehaald van**: https://github.com/una-dinosauria/cmu-mocap, bestanden `data/035/35_01.bvh`, `data/035/35_17.bvh`, `data/009/09_01.bvh` en `data/014/14_31.bvh`.
- **Licentie** (uit `READMEFIRST.txt` in die repository): "CMU places no restrictions on the use of the original dataset, and I (Bruce) place no additional restrictions on the use of this particular BVH conversion." En, als citaat van mocap.cs.cmu.edu: "This data is free for use in research and commercial projects worldwide."
- De BVH-bestanden zelf staan niet in deze repository; alleen het omgerekende resultaat (`src/mocap-data.js`, gemaakt met `tools/bake-mocap.mjs`). De website van CMU zelf is niet opgehaald; de licentietekst komt uit de GitHub-kopie.

## Kaartdata (bestond al)

| Bron | Wat | Licentie |
| --- | --- | --- |
| [3D BAG](https://3dbag.nl) (TU Delft / 3DGI) | gebouwen in 3D met dakvormen (LoD 2.2) | CC BY 4.0 |
| [AHN](https://www.ahn.nl) via PDOK | hoogtekaart | CC0 |
| [BGT](https://www.pdok.nl) via PDOK | wegen, water, groen, bomen, straatmeubilair | CC0 |
| [NWB](https://www.pdok.nl) (Rijkswaterstaat) via PDOK | wegennet met straatnamen | CC0 |
| [Luchtfoto](https://www.beeldmateriaal.nl) (Beeldmateriaal Nederland) via PDOK | luchtfoto 25 cm: kleur van groen, akkers en daken | CC BY 4.0 |

## Software

| Pakket | Gebruik | Licentie |
| --- | --- | --- |
| [three.js](https://threejs.org) r170 | 3D-weergave, onderdelen voor nabewerking (bloom) | MIT |
| [ez-tree](https://github.com/dgreenheck/ez-tree) (Daniel Greenheck) | boommodellen met schors- en bladtexturen | MIT |
| [geotiff](https://geotiffjs.github.io) | inlezen van de hoogtekaart (alleen in `tools/`) | MIT |
| [Vite](https://vitejs.dev) | bouwen | MIT |

## Bewust niet gebruikt

- Mixamo-modellen en de voorbeeldmodellen uit de three.js-repository die daarvan komen (licentie onduidelijk).
- Het MakeHuman-basismodel: niet geprobeerd; de poppetjes zijn in code gebleven.
- Automodellen van buiten: er zijn geen vrij bruikbare zonder account. Alle auto's, inclusief de kentekens (verzonnen), zijn in code gemaakt.
