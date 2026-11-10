#!/usr/bin/env python3
"""Haalt fotografische luchten (HDRI's, Poly Haven, CC0) op en zet ze om naar lichte bestanden voor de game.

Gebruik:  SSL_CERT_FILE=... python3 tools/fetch-hdri.py [tijdelijke map]
Schrijft naar public/data/sky/:
  <naam>_4k.jpg  lucht voor de computer (4096 breed, alleen het deel boven de horizon plus een randje)
  <naam>_2k.jpg  lichte versie (telefoon, en als eerste beeld terwijl de fijne versie laadt)
  sky.json       per lucht: waar de zon staat, kleur van horizon en zenit, sterkte van het hemellicht

Opslag van het grote helderheidsbereik in een gewone JPG: v = hdr * belichting, opgeslagen als
(v / (1 + v)) met sRGB-gamma. De shader rekent terug met v = t / (1 - t). Zo blijven wolkenranden en
de gloed rond de zon helder zonder een zwaar HDR-bestand.
"""
import json
import os
import ssl
import sys
import urllib.request

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'sky')
TMP = sys.argv[1] if len(sys.argv) > 1 else '/tmp/hdri'
ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))

# naam in de game -> (Poly Haven-id, belichting bij het opslaan)
SKIES = {
    'dag': ('kloofendal_48d_partly_cloudy_puresky', 0.5),
    'nacht': ('qwantani_night_puresky', 0.5),
}
KEEP = 0.53  # deel van de hoogte dat bewaard blijft: van het zenit tot ruim 5 graden onder de horizon


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return
    req = urllib.request.Request(url, headers={'User-Agent': 'texture-fetch/1.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=600) as r, open(path, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)


def read_hdr(path):
    """Radiance .hdr (RGBE, met of zonder RLE) naar een float32-array (h, w, 3)."""
    with open(path, 'rb') as f:
        data = f.read()
    pos = data.index(b'\n\n') + 2
    end = data.index(b'\n', pos)
    dims = data[pos:end].decode().split()
    assert dims[0] == '-Y' and dims[2] == '+X', dims
    h, w = int(dims[1]), int(dims[3])
    pos = end + 1
    buf = np.frombuffer(data, dtype=np.uint8)
    out = np.empty((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if buf[pos] == 2 and buf[pos + 1] == 2 and (int(buf[pos + 2]) << 8 | int(buf[pos + 3])) == w:
            pos += 4
            for c in range(4):
                x = 0
                row = out[y, :, c]
                while x < w:
                    n = int(buf[pos]); pos += 1
                    if n > 128:
                        n -= 128
                        row[x:x + n] = buf[pos]; pos += 1
                    else:
                        row[x:x + n] = buf[pos:pos + n]; pos += n
                    x += n
        else:
            out[y] = buf[pos:pos + w * 4].reshape(w, 4)
            pos += w * 4
    e = out[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    return out[..., :3].astype(np.float32) * scale[..., None]


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def encode(hdr, expo):
    v = np.maximum(hdr * expo, 0)
    t = v / (1 + v)
    return (np.clip(np.where(t <= 0.0031308, t * 12.92, 1.055 * np.power(np.maximum(t, 1e-8), 1 / 2.4) - 0.055), 0, 1) * 255 + 0.5).astype(np.uint8)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    info = json.loads(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/assets?t=hdris', headers={'User-Agent': 'texture-fetch/1.0'}), context=ctx, timeout=120).read())
    meta = {}
    for name, (pid, expo) in SKIES.items():
        path = os.path.join(TMP, pid + '_4k.hdr')
        print('ophalen:', pid)
        get(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/{pid}_4k.hdr', path)
        hdr = read_hdr(path)
        h, w, _ = hdr.shape
        L = lum(hdr)
        # zon (of maan): zwaartepunt van de helderste pixels boven de horizon
        top = L[: h // 2]
        thr = np.quantile(top, 0.9995)
        ys, xs = np.nonzero(top >= thr)
        wgt = top[ys, xs]
        # gemiddelde richting (over de naad heen) via eenheidsvectoren
        az = (xs + 0.5) / w * 2 * np.pi
        el = (0.5 - (ys + 0.5) / h) * np.pi
        vx, vy, vz = np.cos(el) * np.cos(az), np.sin(el), np.cos(el) * np.sin(az)
        mx, my, mz = (vx * wgt).sum(), (vy * wgt).sum(), (vz * wgt).sum()
        n = np.sqrt(mx * mx + my * my + mz * mz)
        sun_u = (np.arctan2(mz, mx) / (2 * np.pi)) % 1.0
        sun_el = float(np.degrees(np.arcsin(my / n)))
        # kleuren: horizon (0 tot 5 graden), zenit (boven 60 graden) en het gemiddelde hemellicht (zonder de zon zelf)
        cap = np.minimum(hdr, np.quantile(L, 0.999))
        row = lambda deg: int((0.5 - deg / 180) * h)
        horizon = cap[row(5):row(0)].reshape(-1, 3).mean(0)
        zenith = cap[: row(60)].reshape(-1, 3).mean(0)
        elw = np.cos(np.linspace(np.pi / 2, 0, h // 2))[:, None, None]
        skylight = (cap[: h // 2] * elw).sum((0, 1)) / (elw.sum() * w)
        sunc = (hdr[ys, xs] * wgt[:, None]).sum(0)
        sunc = sunc / max(sunc.max(), 1e-6)
        rows = int(h * KEEP)
        img = Image.fromarray(encode(hdr[:rows], expo), 'RGB')
        img.save(os.path.join(OUT, f'{name}_4k.jpg'), quality=88, optimize=True)
        img.resize((w // 2, rows // 2), Image.LANCZOS).save(os.path.join(OUT, f'{name}_2k.jpg'), quality=86, optimize=True)
        meta[name] = {
            'id': pid, 'naam': info[pid]['name'], 'makers': list(info[pid].get('authors', {}).keys()),
            'belichting': expo, 'deel': KEEP, 'zonU': round(float(sun_u), 5), 'zonHoogte': round(sun_el, 2),
            'horizon': [round(float(x), 4) for x in horizon], 'zenit': [round(float(x), 4) for x in zenith],
            'hemellicht': [round(float(x), 4) for x in skylight], 'zonkleur': [round(float(x), 3) for x in sunc],
            'piek': round(float(L.max()), 1),
        }
        print(' ', json.dumps(meta[name]))
    with open(os.path.join(OUT, 'sky.json'), 'w') as f:
        json.dump(meta, f, indent=1)


if __name__ == '__main__':
    main()
