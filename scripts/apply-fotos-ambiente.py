#!/usr/bin/env python3
"""
Fotos de ambiente por sector (las pasó Cristian el 4 de octubre): van como fotos del público en la pantalla en vivo y
en el móvil del invitado, sin añadir diapositivas. Va después de todos los apply-propuesta-*. Idempotente.

    python3 scripts/apply-fotos-ambiente.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}
A = lambda n: f'asset:img/ambiente/{n}.webp'
ALBUM = cat['pantalla-en-vivo']['props']['photos']

# sector → (fotos del sector, bloques donde van)
POR_SECTOR = {
    'ocio-nocturno': ([A('discoteca-noche')], ['pantalla', 'gente', 'sala', 'contenido-caseta']),
    'promotoras': ([A('discoteca-noche')], ['tu-enjoy', 'gente', 'llevas']),
    'festivales': ([A('festival-noche'), A('festival-dia')], ['zonas', 'publico', 'llevas']),
    # Hoteles: sin fotos de ambiente (no sabemos a qué hotel se enseña; el móvil va con su degradado).
    'hoteles': ([], ['huespedes']),
}
for sg in t['market']:
    if sg['key'] not in POR_SECTOR or not sg.get('proposal'):
        continue
    fotos, bloques = POR_SECTOR[sg['key']]
    for b in bloques:
        blk = sg['proposal']['blocks'].get(b)
        if not blk:
            continue
        tope = 8 if blk['module'] == 'pantalla-en-vivo' else 6
        resto = [f for f in ALBUM if f not in fotos and 'background' not in f]
        blk['props']['photos'] = (fotos + resto)[:tope] if fotos else []

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('fotos de ambiente: locales, promotoras, festivales, hoteles')
