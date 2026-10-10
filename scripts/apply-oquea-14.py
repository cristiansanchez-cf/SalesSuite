#!/usr/bin/env python3
"""
Tarjetas para compartir con las fotos limpias de Cristian (10-oct-2026): «queda mucho mejor que te pase las fotos sin lo
incrustado y lo pongas tú encima». El móvil pasa las tarjetas de HTML (nítidas, con los datos en el idioma de quien lee)
sobre su foto, en el orden de las exportadas: inmersión, récord, viaje, hito y vida marina. Ya no se usan los PNG
exportados (assets/img/exportables/ se quedan como referencia). Idempotente.

    python3 scripts/apply-oquea-14.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
T = 'asset:img/tarjetas/'
CARDS = ['dive', 'record', 'trip', 'milestone', 'species']
PHOTOS = [T + 'inmersion.webp', T + 'record.webp', T + 'viaje.webp', T + 'hito.webp', T + 'especie.webp']
n = 0
for m in t['catalog']:
    sample = (m.get('props') or {}).get('sample')
    if not sample or not sample.get('exports'):
        continue
    sample.pop('exports')
    sample['cards'] = CARDS
    sample['photos'] = PHOTOS
    n += 1
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'oquea 14: {n} módulos con las tarjetas de HTML sobre las fotos limpias')
