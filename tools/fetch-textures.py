#!/usr/bin/env python3
"""Haalt fotorealistische texturen op van Poly Haven (CC0) voor gevels, daken en bestrating.

Gebruik:  SSL_CERT_FILE=... python3 tools/fetch-textures.py
Schrijft naar public/data/tex/: per textuur een kleurbeeld (_d) en een normal map (_n),
in een computer- en een telefoonformaat (_m), plus tex.json met de echte afmetingen.
"""
import io
import json
import os
import ssl
import urllib.request
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'tex')
ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))

# naam in de game -> Poly Haven-id
TEXTURES = {
    # muren (volgorde = materiaalnummer in de gevelshader)
    'pleister': 'painted_plaster_wall',
    'mergel': 'sandstone_blocks_04',
    'baksteen_rood': 'red_brick',
    'baksteen_bruin': 'red_brick_03',
    'baksteen_geel': 'yellow_brick',
    'grijs': 'grey_plaster',
    # daken
    'leien': 'roof_slates_03',
    'pannen_rood': 'roof_tiles',
    'pannen_antraciet': 'grey_roof_tiles',
    'bitumen': 'asphalt_02',
    # bestrating
    'asfalt': 'clean_asphalt',
    'klinkers': 'herringbone_pavement',
    'tegels': 'concrete_tiles',
    'parkeer': 'concrete_pavers',
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'gulpen-game-texture-fetch/1.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=120) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    info = json.loads(get('https://api.polyhaven.com/assets?t=textures'))
    meta = {}
    done = {}
    for name, pid in TEXTURES.items():
        dims = info[pid].get('dimensions') or [2000, 2000]
        meta[name] = {'id': pid, 'size': round(dims[0] / 1000, 3), 'authors': list(info[pid].get('authors', {}).keys())}
        if pid in done:
            continue
        print('ophalen:', pid)
        base = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{pid}/{pid}'
        diff = Image.open(io.BytesIO(get(base + '_diff_1k.jpg'))).convert('RGB')
        nor = Image.open(io.BytesIO(get(base + '_nor_gl_1k.jpg'))).convert('RGB')
        for suffix, d, n in (('', 1024, 512), ('_m', 512, 256)):
            diff.resize((d, d), Image.LANCZOS).save(os.path.join(OUT, f'{pid}_d{suffix}.jpg'), quality=80, optimize=True)
            nor.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, f'{pid}_n{suffix}.jpg'), quality=85, optimize=True)
        done[pid] = True
    json.dump(meta, open(os.path.join(OUT, 'tex.json'), 'w'), indent=1)
    print('Klaar.')


if __name__ == '__main__':
    main()
