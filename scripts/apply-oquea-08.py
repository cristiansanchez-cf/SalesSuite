#!/usr/bin/env python3
"""
UI de la app que pasó Cristian el 6-oct-2026 (logbook público, «¿qué actividad haces hoy?», la inmersión en el logbook,
el álbum y la foto, el mapa con sus marcadores y la ficha del marcador), metida en el contenido. Va después de
apply-oquea-07.py. Idempotente.

- Recorrido, paso 2: el buceador escanea el QR y elige la actividad (pantalla qr-pick).
- «Tu nombre en cada inmersión»: el logbook del buceador (con el nombre del centro) y sus tarjetas para redes.
- Álbum: el álbum y la foto abierta. El texto literal del 05 se queda; dos tarjetas con lo que dijo Cristian
  («útil para tus buceadores… y lo comparten: publicidad gratis») — redactadas por la sesión, revisar.
- Fotos de ejemplo de todas las pantallas (sample.photos): fotos libres (stock:<búsqueda>, Openverse CC0/dominio
  público, las busca el alta del espacio) y, detrás, las dos de Oquea (si una libre no aparece, quedan las demás).

    python3 scripts/apply-oquea-08.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}

for s in t['tour']:
    if s['title'] == 'El buceador escanea el QR':
        s['ui'] = 'app:qr-pick'

cat['tu-nombre']['props']['screens'] = [{'screen': 'logbook'}, {'screen': 'share-card'}]

alb = cat['album']['props']
alb['screens'] = [{'screen': 'album'}, {'screen': 'album-photo'}]
alb['cards'] = [
    {'icon': 'image', 'title': 'Útil para tus buceadores.', 'body': 'Descargan sus fotos y las de sus compañeros de salida.'},
    {'icon': 'megaphone', 'title': 'Y lo comparten.', 'body': 'Cada foto que comparten lleva la inmersión con tu centro: publicidad que no pagas.'},
]

PHOTOS = [
    'stock:scuba diver underwater', 'stock:sea turtle underwater', 'stock:coral reef fish', 'stock:manta ray',
    'stock:dive boat sea', 'stock:scuba divers reef',
    'asset:img/fotos/share-card-bg.webp', 'asset:img/fotos/share-card-aerea.png',
]
n = 0
for m in t['catalog']:
    if m['block_type'] == 'app-steps' and m['props'].get('screens'):
        m['props'].setdefault('sample', {})['photos'] = PHOTOS
        n += 1

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 08: pantallas nuevas en el contenido · fotos de ejemplo en', n, 'módulos')
