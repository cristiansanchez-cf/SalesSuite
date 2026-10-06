#!/usr/bin/env python3
"""
Aplica a tenants/oquea/tenant.json el documento 05 «Catálogo de módulos del dossier · centro de buceo» (v0,
6-oct-2026, docs/ventas/oquea/fuentes/05-catalogo-centro-buceo.md). Va después de apply-oquea-01.py. Idempotente.

- 11 módulos con el texto LITERAL del documento (plantilla app-steps). Lo único mío: los titulares de los módulos
  que el documento no titula y la elección de pantallas (docs/ventas/oquea/agente/05-CATALOGO-CARGADO.md).
- Receta de «Centros de buceo»: mercado → ángulo (uno solo) → preguntas. Argumentario (tope 7) y apoyo visual
  (tope 5: titular y captura; condiciones y siguiente paso, completos).
- Los módulos de la guía que el 05 no usa se quedan fuera del catálogo (is_catalog: false), con su historial.
- Recorrido de Aprende, con el texto del 01.

    python3 scripts/apply-oquea-05.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
PHOTO = 'asset:img/fotos/share-card-bg.webp'
WEB = 'asset:img/producto/web/'
APP = 'asset:img/producto/app/'


def mod(key, name, description, **props):
    props.setdefault('photo', PHOTO)
    return {'key': key, 'block_type': 'app-steps', 'name': name, 'is_catalog': True, 'default_price': None,
            'currency': 'EUR', 'description': description, 'props': props}


# Titulares de portada y textos de la red, por ángulo (literales del 05)
PORTADA = {
    'abrir-mercado': '{company}, centro fundador de la red internacional de Oquea',
    'cobro-online': '{company} en Oquea: del QR en el barco al cobro online',
    'que-vuelvan': '{company}: quién bucea contigo, y cuántas veces',
    'viaje-de-club': '{company} y la red de centros fundadores de Oquea',
}
RED = {
    'abrir-mercado': {'lede': 'Oquea está firmando con centros de distintos países para que los buceadores de unos conozcan a los otros. Los primeros en firmar son los centros fundadores de la red.',
                      'tip': {'kind': 'info', 'text': 'Es un proyecto internacional y va por fases. Hoy empieza con tu centro en el mapa y tu QR en el barco.'}},
    'cobro-online': {'lede': 'Los centros fundadores serán los primeros en probar lo que Oquea está preparando, empezando por la reserva y el cobro online.',
                     'tip': {'kind': 'info', 'text': 'Si te interesa, queda escrito en el acuerdo.'}},
    'que-vuelvan': {'lede': 'Lo que venga después de la lista de buceadores lo vamos a construir con los centros fundadores. Sois los que decís qué hace falta.'},
    'viaje-de-club': {'lede': 'Los centros fundadores de otros países quieren recibir grupos. Si organizas viajes con tus buceadores, la red es un lugar donde encontrar a quién ir.'},
}
CONDICIONES = [
    {'icon': 'check', 'title': 'Hoy.', 'body': 'El alta, el QR, el logbook de tus buceadores, la lista y el perfil en el mapa no tienen coste.'},
    {'icon': 'users', 'title': 'Cuando Oquea te lleve un cliente nuevo.', 'body': 'Oquea se queda un 10 % de esa reserva, en los términos del acuerdo. Si no hay reserva, no hay comisión.'},
    {'icon': 'sparkle', 'title': 'Más adelante.', 'body': 'Habrá funciones de pago. Se presentarán antes a los centros fundadores, y cada centro decidirá si las contrata.'},
    {'icon': 'send', 'title': 'Lo que pedimos.', 'body': 'El acuerdo firmado, el QR a la vista en el barco o en el local, y que el equipo lo mencione en el briefing.'},
]

CATALOG = [
    mod('portada', 'Portada', 'Titular según el ángulo, con el nombre del centro.',
        tone='dark', eyebrow='Oquea', title=PORTADA['que-vuelvan'], highlight='{company}', mark='asset:isotipo-blanco.svg'),
    mod('como-funciona', 'Cómo funciona', 'Los tres pasos: creas la inmersión, el buceador escanea, a ti te queda el registro.',
        title='Cómo funciona',
        cards=[
            {'icon': 'calendar', 'title': '1. Creas la inmersión.', 'body': 'Hora, punto de inmersión y tipo. Los datos del punto ya están cargados: profundidad máxima, tiempo habitual, visibilidad, vida marina.'},
            {'icon': 'qr', 'title': '2. El buceador escanea tu QR.', 'body': 'Elige la inmersión de hoy y la guarda. Su logbook queda relleno sin escribir nada.'},
            {'icon': 'users', 'title': '3. A ti te queda el registro.', 'body': 'Cada buceador que guarda una inmersión entra en tu lista, con todo lo que ha hecho contigo.'},
        ],
        screens=[{'screen': 'create-activity'}, {'screen': 'qr-activity'}, {'screen': 'crm-list'}]),
    mod('tu-nombre', 'Tu nombre en cada inmersión', 'Las tarjetas que exporta el buceador, con el nombre del centro.',
        title='Tu nombre en cada inmersión', highlight='Tu nombre',
        lede='El buceador puede exportar una tarjeta de su inmersión para compartirla. Hay tres: la de la inmersión, la de récord personal y la de hito.',
        cards=[{'icon': 'check', 'title': 'En todas aparecen el nombre y el logo de tu centro.'}],
        screens=[{'screen': 'share-card'}]),
    mod('tus-buceadores', 'Tus buceadores', 'La lista de quién ha buceado con el centro y cuántas veces.',
        title='Tus buceadores', highlight='buceadores',
        lede='Tu lista de buceadores se llena sola: cada persona que guarda una inmersión con tu QR aparece en ella, con su histórico en tu centro.',
        cards=[
            {'icon': 'mail', 'title': 'También puedes añadir buceadores a mano.', 'body': 'Reciben un correo para confirmar.'},
            {'icon': 'users', 'title': 'Hoy la lista sirve para saber quién ha buceado contigo y cuántas veces.'},
        ],
        screens=[{'screen': 'crm-list'}, {'screen': 'crm-diver'}]),
    mod('perfil-y-mapa', 'Tu perfil y el mapa', 'El perfil público del centro y el mapa de Oquea.',
        title='Tu perfil y el mapa', highlight='el mapa',
        lede='Tu centro tiene un perfil público en Oquea: web, idiomas, ubicación, equipo, certificadoras y contacto.',
        cards=[{'icon': 'pin', 'title': 'Aparece en el mapa junto a los puntos de inmersión y los demás centros.', 'body': 'Hoy el mapa cubre España, Latinoamérica y Corea.'}],
        screens=[{'screen': 'map'}]),
    mod('album', 'El álbum', 'El álbum compartido de cada inmersión, 30 días.',
        title='El álbum de cada inmersión', highlight='álbum',
        lede='Cada inmersión tiene un álbum compartido. El centro y los buceadores suben sus fotos y todo el grupo las ve, durante treinta días. Sin pedir teléfonos.',
        screens=[{'screen': 'album'}]),
    mod('eventos', 'Eventos de ONG', 'Los eventos que organizan las ONGs con varios centros.',
        title='Eventos con varios centros', highlight='Eventos',
        lede='Las ONGs organizan eventos en Oquea, como limpiezas, en los que participan varios centros a la vez. La gente se inscribe desde el mapa en el centro más cercano, y tú ves quién va a venir al tuyo.',
        screens=[{'screen': 'event'}]),
    mod('red-fundadores', 'Red de centros fundadores', 'La red, contada según el ángulo. Sin cifras.',
        title='La red de centros fundadores', highlight='centros fundadores', **RED['que-vuelvan']),
    mod('en-preparacion', 'En preparación', 'Solo con el ángulo de cobro online, en España y en argumentario.',
        title='En preparación.', lede='Reserva y cobro online desde Oquea. No está disponible todavía. Se avisará a los centros fundadores cuando lo esté.'),
    mod('condiciones', 'Condiciones', 'Lo que hoy hace las veces de precio: qué no cuesta, la comisión, lo que vendrá y lo que pedimos.',
        title='Condiciones', cards=CONDICIONES),
    mod('siguiente-paso', 'Siguiente paso', 'Los tres gestos de la visita.',
        tone='dark', title='Siguiente paso', mark='asset:isotipo-blanco.svg',
        cards=[
            {'icon': 'send', 'title': '1. Firmamos el acuerdo de centro fundador.'},
            {'icon': 'calendar', 'title': '2. Damos de alta el centro y creamos tu primera inmersión.'},
            {'icon': 'qr', 'title': '3. Dejamos el QR puesto.'},
        ]),
]
new_keys = {m['key'] for m in CATALOG}
# Los de la guía que el 05 no usa: fuera del catálogo, sin borrarlos (los dossiers que ya los tengan siguen igual).
old = [dict(m, is_catalog=False) for m in t['catalog'] if m['key'] not in new_keys]
t['catalog'] = CATALOG + old

# ---------------------------------------------------------------- 2. receta
B = {m['key']: {'module': m['key'], 'props': {}} for m in CATALOG}
# Apoyo visual: titular y captura, sin párrafos (condiciones y siguiente paso, completos).
B['como-funciona-v'] = {'module': 'como-funciona', 'props': {'cards': [{'icon': 'calendar', 'title': '1. Creas la inmersión.'}, {'icon': 'qr', 'title': '2. El buceador escanea tu QR.'}, {'icon': 'users', 'title': '3. A ti te queda el registro.'}]}}
B['red-fundadores-v'] = {'module': 'red-fundadores', 'props': {'lede': ''}}
B['tu-nombre-v'] = {'module': 'tu-nombre', 'props': {'lede': '', 'cards': []}}
# En apoyo visual (tope 5) solo caben los 5 obligatorios: los condicionales no entran.


def angle(key, label, hint, extra=()):
    rules = [{'patch': 'portada', 'set': {'title': PORTADA[key]}}]
    red = RED[key]
    rules.append({'patch': 'red-fundadores', 'set': {'lede': red['lede'], **({'tip': red['tip']} if 'tip' in red else {})}})
    return {'key': key, 'label': label, 'hint': hint, 'rules': rules + list(extra)}


SEG = next(s for s in t['market'] if s['key'] == 'centros-buceo')
SEG['proposal'] = {
    'blocks': B,
    'modes': {
        'full': ['portada', 'como-funciona', 'tu-nombre', 'red-fundadores', 'condiciones', 'siguiente-paso'],
        'visual': ['portada', 'como-funciona-v', 'tu-nombre-v', 'red-fundadores-v', 'condiciones', 'siguiente-paso'],
    },
    'max': {'full': 7, 'visual': 6},  # visual: 6 (Cristian, 6-oct-2026; el 05 decía 5)
    # Orden del 05: obligatorios → tu nombre → tus buceadores → perfil y mapa → álbum → eventos → en preparación.
    'priority': ['portada', 'como-funciona', 'como-funciona-v', 'red-fundadores', 'red-fundadores-v', 'condiciones', 'siguiente-paso',
                 'tu-nombre', 'tu-nombre-v', 'tus-buceadores', 'perfil-y-mapa', 'album', 'eventos', 'en-preparacion'],
    'choices': [
        {'key': 'mercado', 'label': 'Mercado', 'hint': 'Fuera de España, «En preparación» no entra hasta cerrar la revisión legal de pagos.',
         'default': 'espana', 'options': [
             # España: el porcentaje no está cerrado (en torno al 5 %, sin decidir). Regla del 05: si el acuerdo de ese mercado
             # no recoge el 10 %, el bloque de la comisión no entra.
             {'key': 'espana', 'label': 'España', 'rules': [{'patch': 'condiciones', 'set': {'cards': [c for c in CONDICIONES if not c['title'].startswith('Cuando')]}}]},
             {'key': 'latam', 'label': 'Latinoamérica', 'rules': []},
             {'key': 'corea', 'label': 'Corea', 'rules': []},
             {'key': 'otro', 'label': 'Otro', 'rules': []},
         ]},
        {'key': 'angulo', 'label': 'Ángulo: lo que le mueve (uno solo)',
         'hint': 'Si no lo has elegido: «Que vuelvan» en España y «Abrir mercado» fuera (PROPUESTA, por validar).',
         'default': 'que-vuelvan', 'options': [
             angle('que-vuelvan', 'Que vuelvan', 'Le preocupa no saber quién bucea con él ni volver a contactarles. SUPUESTO.',
                   [{'add': 'tus-buceadores', 'after': ['tu-nombre', 'como-funciona']}]),
             angle('abrir-mercado', 'Abrir mercado', 'Recibe o quiere recibir buceadores de otros países. Validado en la feria de Brasil.',
                   [{'add': 'perfil-y-mapa', 'after': ['tus-buceadores', 'tu-nombre', 'como-funciona']}]),
             angle('cobro-online', 'Cobro online', 'Cobra solo en persona y le interesa cobrar online. 3 de los firmantes lo han pedido.',
                   [{'add': 'en-preparacion', 'after': 'red-fundadores', 'when': 'mercado:espana'}]),
             angle('viaje-de-club', 'Viaje de club', 'Organiza viajes de buceo con sus clientes. SUPUESTO: aún no se ha planteado a ningún centro.',
                   [{'add': 'perfil-y-mapa', 'after': ['tus-buceadores', 'tu-nombre', 'como-funciona']}]),
         ]},
    ],
    'questions': [
        {'key': 'no-guarda-datos', 'label': '¿Dijo que no guarda datos de quien bucea con él?',
         'rules': [{'add': 'tus-buceadores', 'after': ['tu-nombre', 'como-funciona']}]},
        {'key': 'fotos', 'label': '¿Comparte fotos con sus clientes por WhatsApp o hace fotos en las inmersiones?',
         'rules': [{'add': 'album', 'before': ['red-fundadores']}]},
        {'key': 'ong', 'label': '¿Colabora con una ONG o participa en limpiezas u otras acciones?',
         'rules': [{'add': 'eventos', 'before': ['red-fundadores']}]},
        {'key': 'sin-comision', 'label': '¿El acuerdo de su mercado NO recoge el 10 %?', 'hint': 'Si no lo recoge, ese bloque de condiciones no entra.',
         'rules': [{'patch': 'condiciones', 'set': {'cards': [c for c in CONDICIONES if not c['title'].startswith('Cuando')]}}]},
    ],
}
SEG['modules'] = [
    {'module_key': 'como-funciona', 'priority': 1, 'fit': 'Siempre: los tres pasos.'},
    {'module_key': 'tu-nombre', 'priority': 1, 'fit': 'Siempre que quepa: su nombre en cada tarjeta.'},
    {'module_key': 'condiciones', 'priority': 1, 'fit': 'Siempre: lo que hoy hace las veces de precio.'},
    {'module_key': 'tus-buceadores', 'priority': 2, 'fit': 'Ángulo «que vuelvan» o si no guarda datos de sus buceadores.'},
    {'module_key': 'perfil-y-mapa', 'priority': 2, 'fit': 'Ángulos «abrir mercado» y «viaje de club».'},
    {'module_key': 'album', 'priority': 3, 'fit': 'Si comparte fotos con sus clientes.'},
    {'module_key': 'eventos', 'priority': 3, 'fit': 'Si colabora con una ONG.'},
]

# ---------------------------------------------------------------- 3. jugadas de la guía: módulos que ya no están
REPOINT = {'sin-instalar': None, 'qr-visible': 'siguiente-paso', 'lo-montamos': None, 'verificacion-24h': None, 'en-minutos': None}
for p in t['playbook']:
    if p['key'] in REPOINT:
        p['module_key'] = REPOINT[p['key']]

# ---------------------------------------------------------------- 4. Aprende · lo que vendes, en 1 minuto (texto del 01 y del 05)
t['tour'] = [
    {'title': 'El centro crea la inmersión', 'body': 'Hora, punto de inmersión y tipo. Los datos del punto ya están cargados.', 'image': WEB + '01-panel-centro-actividades.png'},
    {'title': 'El buceador escanea el QR', 'body': 'Elige la inmersión de hoy y la guarda. Su logbook queda relleno sin escribir nada.', 'image': WEB + '02-registro-qr-logbook.png'},
    {'title': 'La inmersión queda en su logbook', 'body': 'Con los datos del punto de inmersión ya rellenos.', 'image': APP + '19-inmersion-guardada.png'},
    {'title': 'Al centro le queda la lista', 'body': 'Quién ha buceado con él y cuántas veces, con su histórico.', 'image': WEB + '04-crm-perfil-buceador.png'},
    {'title': 'Su nombre y su logo en cada tarjeta', 'body': 'Cada vez que un buceador comparte su inmersión, salen el nombre y el logo del centro.', 'image': 'asset:img/fotos/share-card-aerea.png'},
]

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 05:', len(CATALOG), 'módulos en catálogo ·', len(old), 'fuera ·', len(B), 'bloques ·', len(SEG['proposal']['questions']), 'preguntas')
