#!/usr/bin/env python3
"""
Tarjetas para redes («estilo Strava»), según la UI que pasó Cristian el 6-oct-2026: el sticker de Oquea sobre la foto
del buceador (inmersión, récord personal, hito, viaje, especie). En la tarjeta sale el NOMBRE del centro, no su logo
(«luego el centro puede quedar fatal»), y debajo el logo de Oquea en blanco. Va después de apply-oquea-06.py.
Idempotente.

- Textos: fuera «y su logo» en todo lo que habla de la tarjeta (recorrido, módulos y jugadas).
- Pantalla share-card: un solo móvil que pasa de una tarjeta a otra (sample.cards), cada una con su foto (sample.photos)
  y el logo blanco (sample.brand). Por ahora las tres confirmadas en producción: inmersión, récord e hito.
  Viaje y especie existen en la plantilla, pero no se enseñan hasta confirmar que están en producción.
- Fotos: de ejemplo, provisionales (las de Oquea que hay); se cambian por las que mande Cristian, sin el sticker.

    python3 scripts/apply-oquea-07.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}
pb = {p['key']: p for p in t['playbook']}

# ---- 1. Textos: el nombre del centro, sin su logo
for s in t['tour']:
    if s.get('ui') == 'app:share-card':
        s['title'] = 'Su nombre en cada tarjeta'
        s['body'] = 'Cada vez que un buceador comparte su inmersión, sale el nombre del centro.'
cat['tu-nombre']['props']['cards'][0]['title'] = 'En todas aparece el nombre de tu centro.'
c = cat['compartir']
c['description'] = 'La tarjeta para redes con los datos de la inmersión y el nombre del centro.'
c['props']['title'] = 'Comparten la inmersión, con tu nombre'
c['props']['highlight'] = 'con tu nombre'
c['props']['cards'][0]['body'] = 'Cada tarjeta que se comparte lleva el nombre de tu centro.'
pb['campo-tarjeta']['body'] = '«Cada vez que uno de tus buceadores comparte esto, sale tu nombre.»'
pb['que-recibe-el-centro']['body'] = pb['que-recibe-el-centro']['body'].replace(
    'Su nombre y su logo en cada tarjeta', 'Su nombre en cada tarjeta')

# ---- 2. La pantalla share-card: tarjetas que pasan solas, con su foto y el logo de Oquea
CARDS = ['dive', 'record', 'milestone']
PHOTOS = ['asset:img/fotos/share-card-bg.webp', 'asset:img/fotos/share-card-aerea.png']
n = 0
for m in t['catalog']:
    if m['block_type'] == 'app-steps' and any(x.get('screen') == 'share-card' for x in m['props'].get('screens', [])):
        sample = m['props'].setdefault('sample', {})
        sample.update({'cards': CARDS, 'photos': PHOTOS, 'brand': 'asset:logo-dark.svg'})
        n += 1

text = json.dumps(t, ensure_ascii=False)
assert 'nombre y el logo' not in text and 'nombre y su logo' not in text and 'tu logo' not in text, 'queda «logo» en la tarjeta'
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 07: tarjetas en', n, 'módulos ·', len(CARDS), 'tarjetas')
