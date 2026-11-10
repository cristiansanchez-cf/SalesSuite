#!/usr/bin/env python3
"""
ONG: el ángulo de la propuesta (Cristian, 10-nov-2026: «a las ONG lo que las mueve es conseguir voluntarios y
visibilidad»). Una elección de una sola opción, como la de los centros: cambia la portada, el orden de las diapositivas
y algunos textos; nada inventado (lo que ya contaban los módulos, contado desde lo que le mueve). Y sus combinaciones
de serie. Idempotente; va después de apply-oquea-15.

    python3 scripts/apply-oquea-16.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
seg = next(m for m in t['market'] if m['key'] == 'ong')
p = seg['proposal']

p['choices'] = [{
    'key': 'angulo',
    'label': 'Ángulo: lo que le mueve (uno solo)',
    'hint': 'A las ONG las mueve conseguir voluntarios y que se conozca su trabajo. Elige lo que más le importa a esta.',
    'default': 'voluntarios',
    'options': [
        {'key': 'voluntarios', 'label': 'Conseguir voluntarios',
         'hint': 'Quiere más gente en sus eventos (limpiezas, censos…) y volver a contar con quien ya vino.',
         'rules': [
             {'patch': 'ong-portada', 'set': {'title': '{company}: que la gente se apunte a tus eventos', 'highlight': 'se apunte'}},
             {'patch': 'ong-eventos', 'set': {
                 'lede': 'Creas el evento en Oquea, como una limpieza, y lo abren tus centros de buceo a la vez. La gente se apunta desde el mapa en el centro más cercano, y cada centro ve quién va a venir.'}},
             {'patch': 'ong-participantes', 'set': {'title': 'Quien vino, para el próximo evento', 'highlight': 'para el próximo',
                 'lede': 'Tienes a todas las personas que han participado en tus eventos, en todos los centros: con quién contar la próxima vez.'}},
             {'patch': 'ong-participantes-v', 'set': {'title': 'Quien vino, para el próximo evento', 'highlight': 'para el próximo'}},
             # El mapa, justo después del evento: es por donde se apunta la gente.
             {'remove': 'ong-mapa'},
             {'add': 'ong-mapa', 'after': 'ong-eventos'},
         ]},
        {'key': 'visibilidad', 'label': 'Ganar visibilidad',
         'hint': 'Quiere que se conozca su trabajo entre los buceadores y los centros.',
         'rules': [
             {'patch': 'ong-portada', 'set': {'title': '{company}: tu ONG, a la vista de los buceadores', 'highlight': 'a la vista'}},
             {'patch': 'ong-mapa', 'set': {'title': 'Tu ONG, en el mapa de los buceadores', 'highlight': 'en el mapa',
                 'lede': 'Tu ONG y tus eventos aparecen en el mapa de Oquea, junto a los centros y los puntos de inmersión: donde miran los buceadores cuando buscan dónde bucear.'}},
             {'patch': 'ong-mapa-v', 'set': {'title': 'Tu ONG, en el mapa de los buceadores', 'highlight': 'en el mapa'}},
             # Primero el mapa y la insignia (lo que se ve), después la lista.
             {'remove': 'ong-mapa'},
             {'add': 'ong-mapa', 'after': 'ong-portada'},
             {'remove': 'ong-insignia'},
             {'add': 'ong-insignia', 'after': 'ong-eventos'},
             {'replace': 'ong-participantes-v', 'with': 'ong-mapa-v'},
             {'remove': 'ong-mapa-v'},
             {'add': 'ong-mapa-v', 'after': 'ong-portada'},
         ]},
    ],
}]

seg['templates'] = [
    {'name': 'Conseguir voluntarios', 'mode': 'full', 'answers': ['angulo:voluntarios'],
     'note': 'Quiere más gente en sus eventos y volver a contar con quien ya vino: el evento en todos sus centros, el mapa para apuntarse y su lista.'},
    {'name': 'Ganar visibilidad', 'mode': 'full', 'answers': ['angulo:visibilidad'],
     'note': 'Quiere que se conozca su trabajo: su ONG y sus eventos en el mapa de los buceadores, y la insignia en el perfil de quien participa.'},
    {'name': 'Primera reunión en persona', 'mode': 'visual', 'answers': ['angulo:voluntarios'],
     'note': 'Para enseñarla tú en la reunión con la ONG: menos texto, más pantallas. Cambia el ángulo si lo que busca es visibilidad.'},
]

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 16: ángulo de las ONG (voluntarios / visibilidad) y 3 combinaciones de serie')
