#!/usr/bin/env python3
"""
Tarjetas para redes por defecto: las 5 que exportó Cristian de la app (6-oct-2026), con el sticker ya puesto:
inmersión, récord personal, viaje, hito y especie (tenants/oquea/assets/img/exportables/). En el móvil pasan una tras
otra, tal cual. Las tarjetas en HTML (sample.cards, con el nombre del centro) quedan para la versión personalizable.
Va después de apply-oquea-08.py. Idempotente.

    python3 scripts/apply-oquea-09.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
EXPORTS = [f'asset:img/exportables/{f}' for f in ['1-inmersion.webp', '2-record.webp', '3-viaje.webp', '4-hito.webp', '5-especie.webp']]
n = 0
for m in t['catalog']:
    if m['block_type'] == 'app-steps' and any(x.get('screen') == 'share-card' for x in m['props'].get('screens', [])):
        m['props'].setdefault('sample', {})['exports'] = EXPORTS
        n += 1
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 09: tarjetas exportadas por defecto en', n, 'módulos')
