#!/usr/bin/env python3
"""
Campos del CRM de Enjoy, punto de partida (docs/CRM_DINAMICO.md, fase 1). Va después de apply-aprende-16.py. Idempotente.

Solo lo que ya tiene fuente: «que el local tenga DJ, tenga pantalla» (el fundador, 6-oct) y el aforo, con el que se
eligen las tarifas por tramo. El resto de campos saldrá de su base de datos de Notion (fase 2, importación).
Las ayudas de cada campo son redacción propia: revisarlas.

    python3 scripts/apply-crm-17.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())

CAMPOS = [
    {'key': 'tiene-pantalla', 'label': '¿Tiene pantalla?', 'type': 'checkbox', 'group': 'El local',
     'help': 'Pantalla o proyector propio en la sala (aunque lo lleve un VJ).', 'in_list': True, 'filterable': True},
    {'key': 'dj-residente', 'label': '¿Tiene DJ residente?', 'type': 'checkbox', 'group': 'El local',
     'help': 'Un DJ fijo varias noches: es aliado o puede tumbarlo.', 'in_list': True, 'filterable': True},
    {'key': 'aforo', 'label': 'Aforo', 'type': 'number', 'group': 'El local',
     'help': 'Personas. Decide el tramo de la tarifa.', 'in_list': True, 'filterable': False},
]

crm = t.setdefault('crm', {})
fields = crm.setdefault('fields', [])
have = {f['key'] for f in fields}
for c in CAMPOS:
    if c['key'] in have:
        next(f for f in fields if f['key'] == c['key']).update(c)
    else:
        fields.append(c)

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'CRM 17: {len(fields)} campos en Enjoy ({", ".join(f["key"] for f in fields)})')
