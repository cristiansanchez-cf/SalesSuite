#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 12 «Respuestas a las dudas abiertas del 08»
(docs/ventas/enjoy/fuentes/respuestas-12.md). Va después de apply-propuesta-08.py. Idempotente.

- Karaoke: se puede vender (pregunta en locales, con el texto corregido).
- Caseta de feria: tipo de cliente con propuesta corta (portada, lo que te pasa hoy, el contenido que te llevas, precio) y
  la tarifa 50-50.
- «¿Va automático?»: la respuesta corta.
- Reventa para privados: la parte del dinero es desarrollo; no se carga precio de reventa.
- Prioridad: en el ángulo D y en grupos, el caso se queda antes que los condicionales.

    python3 scripts/apply-respuestas-12.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
seg = next(s for s in t['market'] if s['key'] == 'ocio-nocturno')
pr = seg['proposal']
B = pr['blocks']

# ---------------------------------------------------------------- 1. karaoke
B['karaoke'] = {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Karaoke', 'title': 'La cola, en la pantalla', 'tabs': [{
    'label': 'Karaoke', 'title': 'La cola, en la pantalla',
    'body': ('La gente pide su canción desde el móvil y pone su nombre. Cuando va a entrar, pulsas "Reproduciendo ahora" y en la '
             'pantalla sale la carátula de la siguiente y quién la canta. El que la pidió lo ve y viene solo a por el micro. '
             'Vosotros solo dais el micro.'),
    'bullets': ['Puedes dejarlo gratis o poner un mínimo de 1 € por canción. Ese dinero se queda en tu local.'],
    'mock': {'kind': 'image', 'src': 'asset:img/live/request-mobile-2.webp', 'alt': 'Petición de canción desde el móvil'}}]}}

# ---------------------------------------------------------------- 2. caseta de feria
B['caseta'] = {'module': 'lo-que-te-pasa', 'props': {
    'eyebrow': 'Tu caseta', 'title': 'Diez días para vender y un año entero para preparar la siguiente',
    'cards': [{'problem': 'Diez días para vender y un año entero para preparar la siguiente.',
               'solution': 'Diez días de fiesta te dejan un montón de contenido de la gente que quieres que venga, y sin pagar a un fotógrafo.'}],
    'note': 'Eso es lo que usas el resto del año para preparar la siguiente feria.'}}
sala = B['sala']['props']
B['contenido-caseta'] = {'module': 'movil-invitado', 'props': {
    **sala, 'eyebrow': 'Tu caseta', 'title': 'El contenido que te llevas',
    'parts': [{**sala['parts'][0], 'title': 'El contenido que te llevas'}]}}
SALA_SIN = next(r for q in pr['questions'] if q['key'] == 'sin-pantalla' for r in q['rules'] if r.get('patch') == 'sala')['set']['parts']
CASETA_SIN = [{**SALA_SIN[0], 'title': 'El contenido que te llevas'}]

tipo = next(c for c in pr['choices'] if c['key'] == 'tipo')
tipo['hint'] = 'Charanga sin pantalla y chiringuito sin pantalla no llevan propuesta.'
tipo['options'] = [o for o in tipo['options'] if o['key'] != 'caseta'] + [{
    'key': 'caseta', 'label': 'Caseta de feria',
    'hint': ('Diez días para vender y un año para preparar la siguiente. Con pantalla es cuando interesa de verdad. Sin ángulos. '
             'Si no quiere pagar por adelantado: 50-50 sobre lo que generen las peticiones. Avisa del menú cerrado: decide quién viene.'),
    'rules': [{'replace': 'problema', 'with': 'caseta'}, {'remove': 'pantalla'}, {'remove': 'gente'}, {'remove': 'caso-anon'},
              {'replace': 'sala', 'with': 'contenido-caseta'}, {'patch': 'portada', 'set': {'title': '{company}'}},
              {'patch': 'precio', 'set': {'smallPrint': 'Feria completa o día suelto, pago único.'}}],
}]

# ---------------------------------------------------------------- 4. reventa para privados
for o in tipo['options']:
    if o['key'] == 'privados' and 'desarrollo' not in o['hint']:
        o['hint'] += ' La parte del dinero (su precio, el cobro por nuestra pasarela, su wallet) está en desarrollo: no le pongas precio de reventa.'

# ---------------------------------------------------------------- preguntas: karaoke, y lo que no aplica a una caseta
NO_CASETA = ['tipo:estandar', 'tipo:grupo', 'tipo:privados']
qs = [q for q in pr['questions'] if q['key'] != 'karaoke']
for q in qs:
    if q['key'] in ('vj', 'dj', 'mesas', 'cifras'):
        q['when'] = NO_CASETA
    if q['key'] == 'sin-pantalla' and not any(r.get('patch') == 'contenido-caseta' for r in q['rules']):
        q['rules'].append({'patch': 'contenido-caseta', 'set': {'parts': CASETA_SIN}})
    if q['key'] == 'autorizado':
        q['when'] = NO_CASETA
at = next(i for i, q in enumerate(qs) if q['key'] == 'dj')
qs.insert(at, {'key': 'karaoke', 'label': '¿Es un karaoke o hace noches de karaoke?', 'when': ['tipo:estandar', 'tipo:grupo'],
               'hint': 'No hay aviso de «te toca» ni cola numerada: sale la carátula de la siguiente con el nombre de quien la canta.',
               'rules': [{'add': 'karaoke', 'after': 'sala', 'before': 'precio'}]})
pr['questions'] = qs
for q in pr['questions']:
    if q['key'] == 'dj':
        q['rules'] = [{'add': 'dj', 'after': ['karaoke', 'sala'], 'before': 'precio'}]
    if q['key'] == 'mesas':
        q['rules'] = [{'add': 'mesas', 'after': ['dj', 'karaoke', 'sala'], 'before': 'precio'}]
    if q['key'] == 'cifras':
        q['rules'] = [{'add': 'cuesta', 'after': ['mesas', 'dj', 'karaoke', 'sala'], 'before': 'precio'}]

# ---------------------------------------------------------------- 6. prioridad
BASE = ['portada', 'problema', 'privados', 'caseta', 'pantalla', 'gente', 'sala', 'contenido-caseta', 'precio', 'grupo']
CONDICIONALES = ['karaoke', 'dj', 'mesas', 'cuesta']
CASO = ['caso-anon', 'caso-nombre']
pr['priority'] = BASE + CONDICIONALES + CASO
CASO_PRIMERO = BASE + CASO + CONDICIONALES
for o in tipo['options']:
    if o['key'] == 'grupo':
        o['priority'] = CASO_PRIMERO
for o in next(c for c in pr['choices'] if c['key'] == 'angulo')['options']:
    if o['key'] == 'd':
        o['priority'] = CASO_PRIMERO

# ---------------------------------------------------------------- tarifa 50-50 y sector
if not any(o['label'].startswith('Caseta · 50-50') for o in t['price_options']):
    at = max(i for i, o in enumerate(t['price_options']) if o.get('kind') == 'Caseta de feria') + 1
    t['price_options'].insert(at, {'label': 'Caseta · 50-50 sobre las peticiones', 'amount': 0, 'currency': 'EUR', 'period': 'once',
                                   'segment': 'ocio-nocturno', 'kind': 'Caseta de feria', 'quote_only': True,
                                   'note': 'Sin pago inicial: lo que generen las peticiones, a medias'})
seg['deal_size'] = ('99–499 €/mes (supuesto; hoy pagan 67–100 €/mes). Noche suelta 150 €. Caseta de feria 290 € la feria completa, '
                    '90 € el día suelto, o 50-50 sobre lo que generen las peticiones.')

# ---------------------------------------------------------------- jugadas
plays = {p['key']: p for p in t['playbook']}


def play(key, kind, stage, title, body, segments, audience='all', objection=None):
    base = {'key': key, 'module_key': None, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': segments,
            'personas': [], 'audience': audience, 'about': False, 'pinned': None, 'title': title, 'body': body,
            'when_to_use': None, 'why_it_works': None, 'technique_refs': [], 'status': 'official'}
    if key in plays:
        plays[key].update({k: base[k] for k in ('kind', 'stage', 'objection', 'segments', 'audience', 'title', 'body')})
    else:
        t['playbook'].append(base)
        plays[key] = base


play('noche-karaoke', 'pitch', 'pitch_demo', 'Karaoke: la cola, en la pantalla', (
    '**No existe un aviso de «te toca», y no hace falta.** El responsable pulsa **«Reproduciendo ahora»** en la siguiente canción unos '
    'veinte o treinta segundos antes de que termine la que suena. En la pantalla aparece **la carátula de la próxima canción y el nombre '
    'de quien la pidió**. El que la pidió lo entiende al instante, y el resto de la sala se motiva al ver lo que viene.\n\n'
    '> «La gente pide su canción desde el móvil y pone su nombre. Cuando va a entrar, pulsas "Reproduciendo ahora" y en la pantalla sale '
    'la carátula de la siguiente y quién la canta. El que la pidió lo ve y viene solo a por el micro. Vosotros solo dais el micro.»\n\n'
    '**Se monetiza:** precio mínimo de 1 € por canción. «Reproduciendo ahora» es además el disparador del cobro: solo se cobra cuando la '
    'canción entra.\n\n**Nunca** prometas un aviso personal, una notificación ni una cola con posiciones numeradas.'), ['ocio-nocturno'])

play('noche-caseta-argumento', 'script', 'pitch_demo', 'Con un casetero', (
    'Una caseta es un híbrido de local y promotora: **diez días para vender y un año entero para preparar la siguiente**. No cuidan sus '
    'redes. Lo que les mueve:\n\n> «Diez días de fiesta te dejan un montón de contenido de la gente que quieres que venga, y sin pagar a un '
    'fotógrafo. Eso es lo que usas el resto del año para preparar la siguiente feria.»\n\n**Con pantalla es cuando interesa de verdad.**'),
     ['ocio-nocturno'])

play('noche-caseta-modelos', 'tip', 'negociacion', 'Caseta: los dos modelos de pago', (
    '| Modelo | Cómo funciona | Resultado real |\n|---|---|---|\n'
    '| **Pago fijo** | Pagan 100 € y se quedan todo lo que se genere | Probado |\n'
    '| **50-50** | Sin pago inicial; el ingreso de las peticiones se reparte a medias | Cada parte se queda entre 100 y 200 € |\n\n'
    '**Es el único sitio donde usamos el 50-50.** Se ofrece cuando el casetero no quiere pagar por adelantado.\n\n'
    'Tarifas: 290 € la feria completa (hasta 7 días) · 90 € el día suelto · o 50-50 sobre lo que generen las peticiones.'),
     ['ocio-nocturno'], audience='team')

play('noche-menu-cerrado', 'tip', 'pitch_demo', 'El menú cerrado decide quién viene', (
    'Una caseta que un año fue de público infantil decidió al siguiente cerrar el menú a **música española y antigua** para que no entraran '
    'chavales. Resultado: los chavales dejaron de venir y **la feria le fue peor que la anterior**.\n\n'
    '**El menú cerrado no solo protege el ambiente: decide quién viene.** Si lo cierras demasiado, cambias tu público. Avísalo siempre.'),
     ['ocio-nocturno'])

play('gen-obj-automatico', 'objection', 'objeciones', '«¿Va automático?»', (
    '**No.** Cada canción, cada foto y cada mensaje que sale en pantalla pasa por validación manual. Y hay que decirlo corto:\n\n'
    '> «Siempre hay validación manual. Es como sabes seguro lo que sale en tu pantalla. Y si hay pago, se libera justo al validarlo.»\n\n'
    '**Punto. No se añade nada más.** Si insisten:\n\n> «Estamos viendo acuerdos con proveedores de música para poder automatizarlo.»\n\n'
    '**Nunca** expliques lo de Spotify y el uso comercial: es mucho texto, no lo entienden y les plantas el problema. Cuando se empezó a '
    'contestar corto, nadie volvió a preguntar.'), [], objection='desconfianza')

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('locales:', len(B), 'bloques ·', len(tipo['options']), 'tipos ·', len(pr['questions']), 'preguntas')
