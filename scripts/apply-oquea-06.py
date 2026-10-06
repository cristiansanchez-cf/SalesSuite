#!/usr/bin/env python3
"""
Aprende · «Así funciona, de principio a fin» con la UI de la app, no con capturas (Cristian, 6-oct-2026).
Cada paso del recorrido (tenant.json → tour) lleva `ui`: `app:<pantalla>` pinta un móvil con la pantalla recreada
(src/modules/app-steps/Screen.astro) con los datos de ejemplo del catálogo; `image` se queda de respaldo.
`console:<vista>` (la consola del centro) también existe, pero necesita el módulo center-console en el catálogo y en
Oquea está fuera (is_catalog false): por eso el paso 4 va con el móvil (crm-diver). Va después de apply-oquea-05.py.
Idempotente.

    python3 scripts/apply-oquea-06.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())

UI = {
    'El centro crea la inmersión': 'app:create-activity',
    'El buceador escanea el QR': 'app:qr-activity',
    'La inmersión queda en su logbook': 'app:dive-saved',
    'Al centro le queda la lista': 'app:crm-diver',
    'Su nombre y su logo en cada tarjeta': 'app:share-card',
}
missing = [k for k in UI if k not in {s['title'] for s in t['tour']}]
assert not missing, f'pasos que no están en el tour: {missing}'
for s in t['tour']:
    if s['title'] in UI:
        s['ui'] = UI[s['title']]

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 06: tour con UI en', sum(1 for s in t['tour'] if s.get('ui')), 'de', len(t['tour']), 'pasos')
