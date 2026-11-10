#!/usr/bin/env python3
"""
Combinaciones de serie para los comerciales de Oquea (Cristian, 10-nov-2026: «configuraciones ya prehechas como en Enjoy:
¿interesada en fidelización? tal; ¿en clientes internacionales? tal»). Cada una monta la propuesta con un clic: el ángulo
de la receta, las preguntas que suelen ir con él y el modo. La línea de debajo dice cuándo usarla, con lo que ya dice
cada ángulo (validado o hipótesis). Las de ONG, con su ángulo, en apply-oquea-16. Idempotente.

    python3 scripts/apply-oquea-15.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
ES = 'mercado:espana'

TEMPLATES = {
    'centros-buceo': [
        {'name': 'Fidelización: que vuelvan',
         'note': 'No sabe quién bucea con él ni vuelve a escribirles. Su lista de buceadores, el logbook y el álbum. Hipótesis: pruébala y cuenta cómo va.',
         'answers': [ES, 'angulo:que-vuelvan', 'no-guarda-datos', 'fotos']},
        {'name': 'Clientes internacionales',
         'note': 'Recibe o quiere recibir buceadores de otros países. La red internacional de centros y su perfil en el mapa. Validado en la feria de Brasil.',
         'answers': [ES, 'angulo:abrir-mercado', 'fotos']},
        {'name': 'Cobro online',
         'note': 'Cobra solo en persona y le interesa cobrar online. Lo que viene primero para los fundadores: reserva y cobro. Lo han pedido 3 de los firmantes.',
         'answers': [ES, 'angulo:cobro-online']},
        {'name': 'Viajes de club',
         'note': 'Organiza viajes de buceo con sus clientes. La red como sitio donde encontrar adónde ir. Hipótesis: aún no se ha planteado a ningún centro.',
         'answers': [ES, 'angulo:viaje-de-club', 'fotos']},
        {'name': 'Centro con causa (ONG y limpiezas)',
         'note': 'Colabora con una ONG o hace limpiezas. Sus eventos en Oquea, además de su lista de buceadores.',
         'answers': [ES, 'angulo:que-vuelvan', 'ong', 'fotos']},
        {'name': 'Corea: turismo internacional',
         'note': 'Centro en Corea que quiere recibir buceadores de fuera: centro fundador de Oquea en Corea y la red internacional.',
         'answers': ['mercado:corea', 'angulo:abrir-mercado', 'fotos']},
        {'name': 'Latinoamérica: abrir mercado',
         'note': 'Centro en Latinoamérica que recibe o quiere recibir buceadores de otros países.',
         'answers': ['mercado:latam', 'angulo:abrir-mercado', 'fotos']},
        {'name': 'Primera reunión en persona', 'mode': 'visual',
         'note': 'Para enseñarla tú delante del centro: menos diapositivas y más pantallas. El ángulo, el de que vuelvan; cámbialo si sabes qué le mueve.',
         'answers': [ES, 'angulo:que-vuelvan']},
    ],
}

n = 0
for m in t['market']:
    tps = TEMPLATES.get(m['key'])
    if tps is None:
        continue
    m['templates'] = [{'name': x['name'], 'note': x['note'], 'mode': x.get('mode', 'full'), 'answers': x['answers']} for x in tps]
    n += len(tps)
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'oquea 15: {n} combinaciones de serie')
