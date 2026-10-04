#!/usr/bin/env python3
"""
Fotos reales del producto funcionando (las pasó Cristian el 4 de octubre): módulo «En directo» (plantilla media-strip),
en el catálogo y en las recetas de locales, conciertos y festivales, justo después de la pantalla. Es lo primero que
sale si no cabe (diapositiva solo visual), y no entra donde no hay pantalla ni en las propuestas cortas. Va después de
todos los apply-propuesta-*. Idempotente.

    python3 scripts/apply-en-directo.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())

PROPS = {
    'eyebrow': 'Fotos reales', 'title': 'En directo, en locales de verdad',
    'items': [
        {'src': 'asset:img/real/pantalla-sala.webp', 'alt': 'Pantalla de un local con el QR para pedir canción', 'caption': 'El QR, en la pantalla del local'},
        {'src': 'asset:img/real/escanea-qr.webp', 'alt': 'Alguien escanea el QR de la pantalla con la cámara del móvil', 'caption': 'Se escanea con la cámara, sin descargar nada'},
        {'src': 'asset:img/real/pide-cancion-movil.webp', 'alt': 'Un móvil pidiendo una canción en un local', 'caption': 'Se pide desde el móvil'},
        {'src': 'asset:img/real/lista-peticiones.webp', 'alt': 'La lista de peticiones de canciones en la pantalla de un local', 'caption': 'Y la lista de peticiones, en pantalla'},
    ],
}
cat = [m for m in t['catalog'] if m['key'] != 'en-directo']
at = next(i for i, m in enumerate(cat) if m['key'] == 'pantalla-en-vivo') + 1
cat.insert(at, {'key': 'en-directo', 'block_type': 'media-strip', 'name': 'En directo', 'is_catalog': True, 'default_price': None, 'currency': 'EUR',
                'description': 'Fotos reales del producto funcionando en locales. Diapositiva solo visual: un vistazo.', 'props': PROPS})
t['catalog'] = cat

# sector → (después de qué bloque, opciones/preguntas que lo quitan)
DONDE = {
    'ocio-nocturno': ('pantalla', ['tipo:caseta', 'sin-pantalla']),
    'conciertos': ('visuales', ['tipo:charanga']),
    'festivales': ('zonas', []),
}
for sg in t['market']:
    if sg['key'] not in DONDE:
        continue
    pr = sg['proposal']
    after, quita = DONDE[sg['key']]
    pr['blocks']['en-directo'] = {'module': 'en-directo', 'props': {}}
    for mode, lst in pr['modes'].items():
        if 'en-directo' not in lst:
            anchor = after if after in lst else next((b for b in ('visuales', 'zonas', 'pantalla') if b in lst), None)
            lst.insert(lst.index(anchor) + 1 if anchor else 0, 'en-directo')
    for lst in [pr['priority']] + [o['priority'] for c in pr['choices'] for o in c['options'] if o.get('priority')]:
        if 'en-directo' not in lst:
            lst.append('en-directo')
    for c in pr['choices']:
        for o in c['options']:
            if f"{c['key']}:{o['key']}" in quita and {'remove': 'en-directo'} not in o['rules']:
                o['rules'].append({'remove': 'en-directo'})
    for q in pr['questions']:
        if q['key'] in quita and {'remove': 'en-directo'} not in q['rules']:
            q['rules'].append({'remove': 'en-directo'})

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('en directo: catálogo + locales, conciertos y festivales')
