#!/usr/bin/env python3
"""Haalt de zomerluchtfoto (PDOK, Beeldmateriaal Nederland, CC BY 4.0) op voor het dorp en de omgeving.

Gebruik:  SSL_CERT_FILE=... python3 tools/fetch-ortho.py
Schrijft public/data/ortho-core.jpg (desktop), ortho-core-m.jpg (mobiel) en ortho-wide.jpg.
De uitsnedes volgen 'core' en 'wide' uit public/data/meta.json.
"""
import io
import json
import os
import ssl
import urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0'
LAYER = 'Actueel_ortho25'
MAX = 2000  # de WMS levert maximaal 2500 px per kant

ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))


def get(minx, miny, maxx, maxy, w, h):
    url = (f'{WMS}?service=WMS&version=1.3.0&request=GetMap&layers={LAYER}&styles=&crs=EPSG:28992'
           f'&bbox={minx},{miny},{maxx},{maxy}&width={w}&height={h}&format=image/jpeg')
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, context=ctx, timeout=120) as r:
                return Image.open(io.BytesIO(r.read())).convert('RGB')
        except Exception as e:  # netwerk hapert soms: opnieuw proberen
            print('  opnieuw:', e)
    raise RuntimeError('luchtfoto ophalen mislukt')


def mosaic(box, W, H):
    """Haalt een uitsnede op in stukken van maximaal MAX pixels en plakt ze aan elkaar."""
    img = Image.new('RGB', (W, H))
    nx = -(-W // MAX)
    ny = -(-H // MAX)
    for j in range(ny):
        for i in range(nx):
            px0, px1 = i * W // nx, (i + 1) * W // nx
            py0, py1 = j * H // ny, (j + 1) * H // ny
            sx = (box['maxX'] - box['minX']) / W
            sy = (box['maxY'] - box['minY']) / H
            minx = box['minX'] + px0 * sx
            maxx = box['minX'] + px1 * sx
            maxy = box['maxY'] - py0 * sy  # beeld begint bovenaan (noord)
            miny = box['maxY'] - py1 * sy
            print(f'  stuk {i},{j}: {px1 - px0}x{py1 - py0}')
            img.paste(get(minx, miny, maxx, maxy, px1 - px0, py1 - py0), (px0, py0))
    return img


def main():
    meta = json.load(open(os.path.join(ROOT, 'meta.json')))
    core, wide = meta['core'], meta['wide']
    cw = 4096
    ch = round(cw * (core['maxY'] - core['minY']) / (core['maxX'] - core['minX']))
    print(f'dorp: {cw}x{ch} ({(core["maxX"] - core["minX"]) / cw:.2f} m per pixel)')
    img = mosaic(core, cw, ch)
    img.save(os.path.join(ROOT, 'ortho-core.jpg'), quality=80, optimize=True, progressive=True)
    img.resize((cw // 2, ch // 2), Image.LANCZOS).save(os.path.join(ROOT, 'ortho-core-m.jpg'), quality=80, optimize=True, progressive=True)
    print('omgeving: 2048x2048')
    img = mosaic(wide, 2048, 2048)
    img.save(os.path.join(ROOT, 'ortho-wide.jpg'), quality=78, optimize=True, progressive=True)
    print('Klaar.')


if __name__ == '__main__':
    main()
