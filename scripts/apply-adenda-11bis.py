#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json la adenda 11-bis (docs/ventas/enjoy/fuentes/adenda-11bis.md): el multipantalla se
vende como disponible. Va después de apply-propuesta-11.py. Idempotente.

- Conciertos: «La pantalla de la barra» entra cuando el recinto tiene más de una pantalla.
- Fuera «hoy manejamos una pantalla», la fila de «Nunca» y la de pendientes; en su lugar, la pregunta de descubrimiento.
- Lo general (qué hay hoy, roadmap, lo que no se dice) deja de decir que el multipantalla no existe.

    python3 scripts/apply-adenda-11bis.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
PREGUNTA = '«¿Cuántas pantallas tenéis y en qué zonas? Podemos poner contenido distinto en cada una.»'
BARRA = ('Una pantalla en la zona de barra, con contenido propio: una promoción, una felicitación, lo que se te ocurra en el '
         'momento. Todo a golpe de móvil, sin tocar la del escenario.')

# ---------------------------------------------------------------- receta de conciertos
pr = next(s for s in t['market'] if s['key'] == 'conciertos')['proposal']
pr['blocks']['barra'] = {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Varias pantallas', 'title': 'La pantalla de la barra', 'tabs': [{
    'label': 'Barra', 'title': 'Contenido propio en la barra', 'body': BARRA, 'bullets': [],
    'mock': {'kind': 'image', 'src': 'asset:img/tabs/messages-screen.webp', 'alt': 'Mensajes en la pantalla de la barra'}}]}}
if 'barra' not in pr['priority']:
    pr['priority'].insert(pr['priority'].index('precio') + 1, 'barra')
pr['questions'] = [q for q in pr['questions'] if q['key'] != 'pantallas'] + [{
    'key': 'pantallas', 'label': '¿El recinto tiene más de una pantalla?', 'hint': 'Pregunta: ' + PREGUNTA,
    'when': ['tipo:sala', 'tipo:promotor', 'tipo:artista', 'tipo:agencia'],
    'rules': [{'add': 'barra', 'after': 'llevas', 'before': ['menu', 'preshow', 'marca', 'precio']}]}]
tipo = next(c for c in pr['choices'] if c['key'] == 'tipo')
tipo['hint'] = tipo['hint'].replace('Hoy manejamos una pantalla: acótalo en la primera reunión.', 'Pregunta: ' + PREGUNTA)

# ---------------------------------------------------------------- jugadas
plays = {p['key']: p for p in t['playbook']}
plays['conc-una-pantalla'].update({'title': 'Varias pantallas, contenido distinto', 'body': (
    'Gestionar varias pantallas con contenido distinto **se vende como disponible**. Donde antes se acotaba a una, ahora se pregunta:\n\n'
    '> ' + PREGUNTA + '\n\nLo que abre: **la pantalla de la barra**. Comunicación y venta in situ con el público esperando, sin tocar la del '
    'escenario. Es el argumento de barra, el que mejor funciona con una sala, aplicado a conciertos.\n\n'
    '**El límite sigue siendo no inventar nada más allá de esto.** Multipantalla sí; CRM, remarketing y vídeo en directo, no.')})
plays['conc-multipantalla'].update({'title': 'Cuántas pantallas y en qué zonas', 'body': (
    '> ' + PREGUNTA + '\n\n**Se pregunta en la primera reunión.** Además de vender, te da información útil del recinto.')})
n = plays['conc-nunca']
n['body'] = '\n'.join(l for l in n['body'].split('\n') if 'Prometer varias pantallas' not in l)
pe = plays['conc-pendiente']
pe['body'] = '\n'.join(l for l in pe['body'].split('\n') if not l.startswith('| Multipantalla'))
h = plays['gen-hoy']
h['body'] = h['body'].replace('**Una pantalla:** hoy se controla una sola. En recintos con varias, la conversación es qué pantalla y en qué momento.',
                              '**Varias pantallas:** contenido distinto en cada una (piscina, buffet, teatro; escenario y barra). Se vende como disponible.')
r = plays['gen-roadmap']
r['body'] = '\n'.join(l for l in r['body'].split('\n') if not l.startswith('- **Varias pantallas a la vez**'))
for k, a, b in (('gen-no-decir', 'Multipantalla, CRM, remarketing', 'CRM, remarketing'), ('noche-no-decir', 'Multipantalla, CRM, remarketing', 'CRM, remarketing')):
    plays[k]['body'] = plays[k]['body'].replace(a, b)

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('adenda 11-bis aplicada: la pantalla de la barra, pregunta de pantallas, multipantalla disponible')
