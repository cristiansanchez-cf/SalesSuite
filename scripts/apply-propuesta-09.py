#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 09 «La propuesta de PROMOTORAS · documento completo»
(docs/ventas/enjoy/fuentes/propuesta-09.md). Misma estructura que el 08 (locales): hereda lo que no se contradice.
Idempotente.

Tipo de promotora (pequeña, asentada) → ángulo (A–D, uno solo) → frecuencia (decide el formato de precio, no el
tamaño) → condicionales, con tope de 7 módulos. La operación de escala (tipo Bresh) la lleva fundador: sin propuesta.

    python3 scripts/apply-propuesta-09.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}


def cards(*pairs):
    return [{'problem': a, 'solution': b} for a, b in pairs]


# ---------------------------------------------------------------- ángulos (sección 2), literales
ANGULOS = {
    'a': {
        'label': 'A · Comercial', 'portada': 'El contenido de tu fiesta, para llenar la siguiente',
        'hint': 'Vender las entradas de la siguiente. Reggaetón y público amplio: foco en el público, no en quién pincha. Precio: evento suelto, y si hace varias al mes, el salto a suscripción.',
        'cards': cards(
            ('Para vender la siguiente necesitas contenido, y acabas pidiendo fotos a los amigos.', 'Cada fiesta te deja cientos de fotos subidas por tu propio público, con permiso para usarlas.'),
            ('Montas en salas distintas y cada una te deja lo que puede.', 'Llevas lo tuyo: tu QR, tus dinámicas, tu contenido. La sala pone el espacio.'),
            ('Tu fiesta se parece a la de la semana siguiente.', 'Algo que pasa en tu fiesta y en la de al lado no.')),
    },
    'b': {
        'label': 'B · Dinámicas', 'portada': 'La herramienta que te faltaba para lo que ya montas',
        'hint': 'Montar dinámicas que nadie monta: las que ya hacen temporizadores, juegos, retos. Paradox encajó por aquí y fue inmediato. Entra siempre «Lo que montan otras promotoras».',
        'cards': cards(
            ('Las dinámicas las montas peleándote con el ordenador del local.', 'Lo lanzas desde tu móvil, en el momento, sin tocar nada de la sala.'),
            ('Cada sala tiene su cacharro y nunca sabes qué te vas a encontrar.', 'Llegas, cambias el identificador de la pantalla y ya es tuya. Dos minutos.'),
            ('Se te ocurren cosas y no hay forma de hacerlas.', 'Mensajes entre mesas, retos de fotos, sorteos por participación.')),
    },
    'c': {
        'label': 'C · Underground', 'portada': 'Que se acuerden de quién pinchó',
        'hint': 'Que se recuerde al artista que trae: afters, sesiones, artistas nuevos. Aquí el DJ es el producto. Peticiones de canciones: nunca como argumento de entrada (marca la pregunta del reto solo si el artista está por la labor).',
        'cards': cards(
            ('Traes artistas que nadie conoce y nadie se queda con su nombre.', 'La carátula del tema sale en pantalla mientras suena. Se quedan con el disco y con el artista.'),
            ('La gente te pregunta qué está sonando y nadie contesta.', 'Lo ven en su móvil al escanear, con el nombre de quien está pinchando.'),
            ('Tu DJ pincha y se va sin ganar seguidores.', 'Desde el móvil pueden seguirle las redes ahí mismo.')),
    },
    'd': {
        'label': 'D · Público que no conoces', 'portada': 'Que te digan ellos qué quieren oír',
        'hint': 'Fiestas de país, Erasmus, extranjeros, temáticas. Se vende como «ves qué canciones te piden y cuáles no tienes»; nunca como perfil demográfico (necesita registro: roadmap).',
        'cards': cards(
            ('Montas una temática de un país y pones el top 10 de allí, a ciegas.', 'Te lo piden ellos, y la próxima vez ya lo tienes.'),
            ('Tu público cambia cada fiesta y no sabes qué pinchar.', 'Ves qué te pidieron y qué no pudiste poner.'),
            ('Cambias de sala y empiezas de cero.', 'Los datos son tuyos y se van contigo a la siguiente.')),
        'note': 'Si el primer día te piden cinco canciones que no tienes, el segundo ya las tienes.',
    },
}

# ---------------------------------------------------------------- 03 · Tu Enjoy, en cualquier sala
scenes = {s['scene']: s for s in cat['pantalla-en-vivo']['props']['scenes']}
TU_ENJOY = ('Llegas a la sala, cambias el identificador en la pantalla y ya está apuntando a tu Enjoy. Tus dinámicas, tu QR, '
            'tu marca. Si el local ya tiene Enjoy, se usa el tuyo: como el confeti, el que lo trae lo pone.')
IDLE = {**scenes['club.idle'], 'label': 'Tu Enjoy', 'says': TU_ENJOY}
# Lo que sí monta una promotora en pantalla (0.1): la venta en barra no es suya.
RETO = {'scene': 'club.promo', 'label': 'Tu reto', 'text': 'Solteros, manos arriba',
        'says': 'Lo lanzas desde tu móvil, en el momento, sin tocar nada de la sala.'}
FOTO = {**scenes['club.photo'], 'says': 'Su foto en grande y entera (nunca se recorta una cara). Y se queda en el álbum de la fiesta.'}
SCENES = [IDLE, RETO, FOTO, scenes['club.message'], scenes['club.song']]
# Underground: sin peticiones de canciones (el que sabe es el artista).
SCENES_C = [IDLE, RETO, FOTO, scenes['club.message']]
RETO_DJ = {**scenes['club.song'], 'label': 'Reto del DJ',
           'says': 'Hay DJs que lo activan solo los días que les apetece el reto: la gente pide lo que quiera y él demuestra que lo mezcla todo.'}

# ---------------------------------------------------------------- 04 · tu gente (de locales, sin «tu local») y 05 · lo que te llevas
PASO_QR = {'key': 'scan', 'says': 'Apunta con la cámara al QR. Sin descargar nada y sin registrarse.', 'owner': 'Entra todo el mundo, también el que no se baja apps.'}
PASO_ELIGE = {'key': 'sheet', 'says': 'Elige: foto en pantalla, mensaje, o subir al álbum.', 'owner': 'Tres motivos distintos para sacar el móvil en tu fiesta.'}
PASO_MANDA = {'key': 'form', 'label': 'Su dedicatoria', 'says': 'Escribe su dedicatoria y la manda.', 'owner': 'Tu equipo la aprueba desde su móvil en un segundo.'}
GENTE = [{'title': 'Lo que va a hacer tu gente', 'steps': [PASO_QR, PASO_ELIGE, PASO_MANDA]}]
GENTE_SIN = [{'title': 'Lo que va a hacer tu gente', 'steps': [{**PASO_QR, 'owner': 'El QR va en la barra y en las mesas.'}, PASO_ELIGE, PASO_MANDA]}]
FILA_PANTALLA = {'key': 'live', 'says': 'Su foto sale en grande delante de todos.', 'owner': 'Media pista mirando la pantalla a ver quién sale.'}
FILAS = [
    {'key': 'album', 'says': 'Se queda en el álbum de la fiesta.', 'owner': 'Cientos de fotos de tu fiesta, listas para vender la siguiente.'},
    {'key': 'form', 'label': 'Con permiso', 'says': 'Al subirla acepta los términos de uso.', 'owner': 'Son tuyas, no de la sala. Y se van contigo.'},
]
LLEVAS = [{'title': 'Y lo que te llevas', 'steps': [FILA_PANTALLA, *FILAS]}]
LLEVAS_SIN = [{'title': 'Y lo que te llevas', 'steps': FILAS}]
MOVIL = {'lede': '', 'djName': '', 'price': 0}

# ---------------------------------------------------------------- 06 caso Paradox, 07 dinámicas, 08 artista, 09 datos
CASO_NOMBRE = 'Paradox es una promotora de Albacete que ya montaba dinámicas en pantalla. Lo vieron al momento y han hecho ya dos eventos con nosotros.'
CASO_ANON = 'Una promotora de Albacete que ya montaba sus propias dinámicas lo vio al momento y lleva dos eventos.'
DATOS = 'Qué te pidieron, a qué hora y cuánta gente participó. En tu cuenta, no en la de la sala. La siguiente fiesta la montas sabiendo algo.'

proposal = {
    'blocks': {
        'portada': {'module': 'portada', 'props': {'eyebrow': 'Propuesta para {company}', 'title': ANGULOS['a']['portada'],
                                                    'subtitle': 'Tu público participa desde el móvil, sale en la pantalla, y tú te quedas con el contenido.'}},
        'problema': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que te pasa hoy', 'cards': ANGULOS['a']['cards']}},
        'tu-enjoy': {'module': 'pantalla-en-vivo', 'props': {'eyebrow': 'Para ti', 'title': 'Tu Enjoy, en cualquier sala', 'lede': '', 'djName': '', 'scenes': SCENES}},
        'gente': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Tu gente', 'title': 'Lo que va a hacer tu gente', 'parts': GENTE}},
        'llevas': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Para ti', 'title': 'Y lo que te llevas', 'parts': LLEVAS, 'ownerLabel': 'Lo que te llevas tú'}},
        'caso-anon': {'module': 'caso-real', 'props': {'eyebrow': 'Un caso real', 'title': 'Lo vieron al momento', 'client': 'Una promotora', 'place': 'Albacete', 'body': CASO_ANON}},
        'caso-nombre': {'module': 'caso-real', 'props': {'eyebrow': 'Un caso real', 'title': 'Lo vieron al momento', 'client': 'Paradox', 'place': 'Albacete', 'body': CASO_NOMBRE}},
        'dinamicas': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Dinámicas', 'title': 'Lo que montan otras promotoras', 'tabs': [
            {'label': 'Entre mesas', 'title': 'Mensajes entre mesas', 'body': '', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/messages-screen.webp', 'alt': 'Mensajes entre mesas en la pantalla'}},
            {'label': 'Por fotos', 'title': 'Chupito o entrada por subir fotos', 'body': '', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-mobile.webp', 'alt': 'Álbum de la fiesta en el móvil'}},
            {'label': 'Sorteo', 'title': 'Sorteo por participación', 'body': 'Con el contador que valida tu staff en dos segundos.', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-grid.webp', 'alt': 'Fotos subidas por el público'}}]}},
        'artista': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Tu artista', 'title': 'El artista en pantalla', 'tabs': [
            {'label': 'Carátula', 'title': 'La carátula del tema mientras suena', 'body': '', 'bullets': []},
            {'label': 'Quién pincha', 'title': 'El nombre de quien pincha, visible al escanear', 'body': '', 'bullets': []},
            {'label': 'Sus redes', 'title': 'Sus redes, a un toque desde el móvil del público', 'body': '', 'bullets': []}]}},
        'datos': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Tus datos', 'title': 'Los datos se van contigo', 'tabs': [
            {'label': 'Tus datos', 'title': 'Los datos se van contigo', 'body': DATOS, 'bullets': []}]}},
        'precio': {'module': 'pricing', 'props': {
            'eyebrow': 'Cómo empezamos', 'title': 'Propuesta para {company}',
            'subtitle': 'Lo dejamos configurado contigo a distancia antes de tu fiesta. No hace falta que vayamos.',
            'features': ['Tu cuenta, tu QR y tus dinámicas', 'Personalización con tu marca', 'Analítica de participación de cada fiesta'],
            'smallPrint': 'Evento suelto, pago único.'}},
    },
    'modes': {
        'full': ['portada', 'problema', 'tu-enjoy', 'gente', 'llevas', 'caso-anon', 'precio'],
        'visual': ['tu-enjoy', 'gente', 'llevas', 'precio'],
    },
    'max': {'full': 7, 'visual': 5},
    # Si no caben: los obligatorios; luego los condicionales en su orden (dinámicas → artista → datos) y el caso el último.
    'priority': ['portada', 'problema', 'tu-enjoy', 'gente', 'llevas', 'precio', 'dinamicas', 'artista', 'datos', 'caso-anon', 'caso-nombre'],
    'choices': [
        {'key': 'tipo', 'label': '¿Qué tipo de promotora es?', 'default': 'pequena',
         'hint': 'Operación de escala (tipo Bresh: la misma fiesta en muchas ciudades): no es una promotora grande, es otra venta. La lleva fundador y no lleva propuesta. Promotora grande o internacional: ve tú al primer evento a montarlo.',
         'options': [
             {'key': 'pequena', 'label': 'Pequeña o que empieza',
              'hint': 'Pocas fiestas, decisión rápida y sin presupuesto. Compran eventos sueltos. El riesgo es el seguimiento, no el precio.'},
             {'key': 'asentada', 'label': 'Asentada',
              'hint': 'Varias fiestas al mes, estructura, alguien que lleva las cuentas. Aquí sí: pack anual o suscripción. Pregunta: «¿Cuántas fiestas montáis al año?»'},
         ]},
        {'key': 'angulo', 'label': '¿Qué le mueve a esta promotora?', 'default': 'a', 'hint': 'Uno solo, nunca mezclados.',
         'options': [
             {'key': k, 'label': a['label'], 'hint': a['hint'], 'rules': [
                 {'patch': 'portada', 'set': {'title': a['portada']}},
                 {'patch': 'problema', 'set': {'cards': a['cards'], **({'note': a['note']} if a.get('note') else {})}},
             ] + {
                 'b': [{'add': 'dinamicas', 'after': 'llevas', 'before': 'precio'}],
                 'c': [{'patch': 'tu-enjoy', 'set': {'scenes': SCENES_C}},
                       {'add': 'artista', 'after': 'llevas', 'before': 'precio'}, {'add': 'datos', 'after': ['artista', 'llevas'], 'before': 'precio'}],
                 'd': [{'add': 'datos', 'after': 'llevas', 'before': 'precio'}],
             }.get(k, [])}
             for k, a in ANGULOS.items()
         ]},
        {'key': 'frecuencia', 'label': '¿Cuántas fiestas montáis al año?', 'default': 'suelto',
         'hint': 'La frecuencia decide el formato de precio, no el tamaño. Nunca un mensual a quien hace pocas fiestas al año: Paradox hace seis, lo suyo es el pack.',
         'options': [
             {'key': 'suelto', 'label': '1 a 4 al año · evento suelto', 'hint': 'Tarifa: 90 € promotora pequeña · 150 € asentada.'},
             {'key': 'pack', 'label': '5 a 12 al año · pack anual', 'hint': 'Tarifa: 490 € por 6 eventos · 890 € por 12. Propuesta sin validar.',
              'rules': [{'patch': 'precio', 'set': {'smallPrint': 'Pack anual de eventos, pago único.'}}]},
             {'key': 'mensual', 'label': '4 o más al mes · suscripción', 'hint': 'Tarifa: 390 € al mes, eventos ilimitados.',
              'rules': [{'patch': 'precio', 'set': {'smallPrint': 'Suscripción con permanencia de 6 meses. Eventos ilimitados.'}}]},
         ]},
    ],
    'questions': [
        {'key': 'autorizado', 'label': '¿Paradox ha autorizado por escrito salir con su nombre?',
         'hint': 'Sin autorización escrita, el caso sale anónimo.',
         'rules': [{'replace': 'caso-anon', 'with': 'caso-nombre'}]},
        {'key': 'dinamicas', 'label': '¿Te ha hablado de dinámicas que ya monta?', 'hint': 'Solo estas tres. Votaciones y cuentas atrás: pendiente de confirmar.',
         'rules': [{'add': 'dinamicas', 'after': 'llevas', 'before': 'precio'}]},
        {'key': 'reto', 'label': '¿El artista quiere el formato de reto con peticiones?', 'when': ['angulo:c'],
         'hint': 'Solo si el artista está por la labor. Nunca como argumento de entrada.',
         'rules': [{'insert': 'tu-enjoy', 'into': 'scenes', 'at': 4, 'value': RETO_DJ}]},
        {'key': 'sin-pantalla', 'label': '¿La sala no tiene pantalla?', 'hint': 'Fuera «Tu Enjoy, en cualquier sala» y la parte de pantalla. El QR va en barra y mesas.',
         'rules': [{'remove': 'tu-enjoy'}, {'patch': 'gente', 'set': {'parts': GENTE_SIN}}, {'patch': 'llevas', 'set': {'parts': LLEVAS_SIN}},
                   {'patch': 'portada', 'set': {'subtitle': 'Tu público participa desde el móvil, y tú te quedas con el contenido.'}}]},
    ],
}

for sg in t['market']:
    if sg['key'] == 'promotoras':
        sg['proposal'] = proposal
        sg['icp'] = ('- Promotoras pequeñas o que empiezan: deciden en el momento y compran eventos sueltos\n'
                     '- Promotoras asentadas: varias fiestas al mes, pack anual o suscripción\n'
                     '- Comerciales (reggaetón, público amplio), las que ya montan dinámicas, underground y fiestas de público que no conocen')
        sg['disqualifiers'] = '- Operación de escala (tipo Bresh): no es para el equipo comercial, la lleva fundador'
        sg['deal_size'] = ('Por frecuencia: 1–4 fiestas al año, evento suelto (90 € pequeña · 150 € asentada); 5–12 al año, pack anual '
                           '(490 € por 6 · 890 € por 12, sin validar); 4 o más al mes, 390 €/mes ilimitados. Paradox pagó 50 € con el producto antiguo.')

# ---------------------------------------------------------------- tarifas por frecuencia (sección 4)
PROM = [
    {'label': 'Promotora pequeña · evento suelto', 'amount': 90, 'period': 'event', 'default': True},
    {'label': 'Promotora asentada · evento suelto', 'amount': 150, 'period': 'event', 'default': False},
    {'label': 'Promotora · pack anual de 6 eventos', 'amount': 490, 'period': 'year', 'default': False, 'note': 'Propuesta sin validar'},
    {'label': 'Promotora · pack anual de 12 eventos', 'amount': 890, 'period': 'year', 'default': False, 'note': 'Propuesta sin validar'},
    {'label': 'Promotora · eventos ilimitados', 'amount': 390, 'period': 'month', 'default': False},
]
opts = [o for o in t['price_options'] if o.get('segment') != 'promotoras']
at = next((i for i, o in enumerate(t['price_options']) if o.get('segment') == 'promotoras'), len(opts))
# La de 150 € «Evento de promotora» queda inactiva (el alta sincroniza por nombre: si se borra del JSON, se queda como esté).
viejas = [{**o, 'active': False, 'default': False} for o in t['price_options'] if o.get('segment') == 'promotoras' and o['label'] not in {p['label'] for p in PROM}]
nuevas = [{'label': p['label'], 'amount': p['amount'], 'currency': 'EUR', 'period': p['period'], 'segment': 'promotoras', 'kind': 'Promotora',
           'default': p['default'], **({'note': p['note']} if p.get('note') else {})} for p in PROM]
t['price_options'] = opts[:at] + nuevas + viejas + opts[at:]

# ---------------------------------------------------------------- jugadas
plays = {p['key']: p for p in t['playbook']}


def play(key, kind, stage, title, body, audience='all', objection=None):
    base = {'key': key, 'module_key': None, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': ['promotoras'],
            'personas': [], 'audience': audience, 'about': False, 'pinned': None, 'title': title, 'body': body,
            'when_to_use': None, 'why_it_works': None, 'technique_refs': [], 'status': 'official'}
    if key in plays:
        plays[key].update({k: base[k] for k in ('kind', 'stage', 'objection', 'audience', 'title', 'body')})
    else:
        t['playbook'].append(base)
        plays[key] = base


play('prom-entender', 'fit', 'descubrimiento', 'Lo que hay que entender antes de vender a una promotora', (
    '**El local se queda la barra. La promotora se queda la mayor parte de las entradas.** Lo habitual: de cada 10 € de entrada, '
    'unos 6 van para la promotora y el resto para el local.\n\n'
    '- **La venta in situ en barra le interesa poco.** Ese dinero no es suyo. Lo que sí puede montar es «solteros, manos arriba» o '
    'retos en pantalla, que le sirven para el ambiente y para el contenido.\n'
    '- **Todo lo que le vendas tiene que acabar en llenar la siguiente fiesta.** Esa es su única cuenta.\n\n'
    '**Su miedo: la marca.** Su activo es su nombre, y esa decisión se gana en redes. **Su trabajo de verdad empieza después del '
    'evento**: el contenido es lo que llena la siguiente.\n\n'
    '**Lleva su propio Enjoy a donde vaya.** Al llegar a la sala, en la pantalla se cambia el identificador: donde ponía `VIP01` (el del '
    'local) se pone `PRX01` (el de la promotora). **Dos minutos.** Si la sala también tiene Enjoy, manda el de la promotora: es como el '
    'confeti, si traes el tuyo, se usa el tuyo. **La analítica la ven los dos**, cada uno la de su cuenta.\n\n'
    '**Se configuran solas:** Paradox se vendió y se montó a distancia, con un par de tutoriales antes del evento. **Excepción:** '
    'promotora grande o con operativa internacional. Ahí el comercial va al primer evento a montarlo; a los siguientes, no.'))

play('prom-diferencias', 'fit', 'descubrimiento', 'Las cuatro diferencias con un local', (
    '| | Local | Promotora |\n|---|---|---|\n'
    '| Qué compra | Que su sala sea distinta todas las noches | Material y dinámicas para **vender entradas de la siguiente** |\n'
    '| Formato | Suscripción mensual | **Lo decide la frecuencia**: evento suelto, pack anual o suscripción |\n'
    '| Quién decide | Dueño o gerente, con el DJ pudiendo vetar | Quien lleva la promotora, rápido y solo |\n'
    '| El riesgo | Que nadie valide | **Que se enfríe en el seguimiento** |'))

play('prom-quien-encaja', 'fit', 'prospeccion', 'Tipos de promotora', (
    '**Pequeña o que empieza.** Chavales, pocas fiestas, decisión rápida y sin presupuesto. Deciden en el momento (a Paradox, 50 € le '
    'pareció bien al instante) y compran eventos sueltos. El riesgo es el seguimiento, no el precio.\n\n'
    '**Asentada.** Varias fiestas al mes, estructura, alguien que lleva las cuentas. Aquí sí tiene sentido plantear suscripción o pack '
    'anual. La pregunta que lo decide: **¿cuántos eventos hacéis al año?**\n\n'
    '**Operación de escala** (Bresh y equivalentes: la misma fiesta en muchas ciudades y países). **No es una promotora grande: es otra '
    'venta.** Lo que compra es saber qué pide cada ciudad antes de montar allí. **La lleva fundador, no el equipo comercial.** Está en '
    'proceso: puedes contarlo como prueba de que el producto interesa arriba, pero no la toques.'))

play('prom-pitch', 'pitch', 'pitch_demo', 'Lo que se cuenta', (
    '> «Cada fiesta que montáis os deja cientos de fotos y vídeos subidos por vuestro propio público, aceptando los términos. Material de '
    'vuestra fiesta, para vender la siguiente. Y en pantalla podéis montar lo que queráis: retos, mensajes entre mesas.»\n\n'
    'Votaciones y cuentas atrás: **PENDIENTE** de confirmar que existen. No las nombres.'))

play('prom-precio', 'monetization', 'negociacion', 'Precio: lo decide la frecuencia', (
    'La primera pregunta no es el tamaño:\n\n> «¿Cuántas fiestas montáis al año?»\n\n'
    '| Frecuencia | Formato | Precio |\n|---|---|---|\n'
    '| 1-4 al año | Evento suelto | **90 €** promotora pequeña · **150 €** asentada |\n'
    '| 5-12 al año | Pack anual | **490 €** por 6 eventos · **890 €** por 12 (sin validar) |\n'
    '| 4 o más al mes | Suscripción mensual | **390 €**, eventos ilimitados |\n\n'
    '**El error que hay que evitar:** ofrecerle un mensual de 390 € a quien hace seis fiestas al año. Paradox hace seis: su formato es el '
    'pack anual, no el mensual.\n\n**El salto:** «pruebo un evento a un precio razonable, y si funciona me paso al pack porque me sale mejor».'))

play('prom-precio-referencias', 'tip', 'negociacion', 'De dónde salen los precios', (
    '- Paradox vio **50 €** y dijo que sí al momento, con el producto antiguo.\n- **70-80 €** no habría tenido problema.\n'
    '- **100-150 €** es el rango para promotoras más asentadas.\n\nLos 90 € salen de ahí. **Los packs anuales están sin validar.**'),
     audience='team')

play('prom-seguimiento', 'tip', 'seguimiento', 'El riesgo específico de este sector', (
    'El seguimiento es el riesgo de este sector, no el precio. Los equipos están dispersos y siempre ocupados. No es desinterés, es su '
    'forma de trabajar. Con Paradox costó el seguimiento y acabaron siendo clientes.\n\n'
    '> Regla: si no contestan, no es un no. Se vuelve a escribir con una fecha concreta, nunca con un «¿cómo lo veis?».'))

play('prom-nunca', 'tip', 'mentalidad', 'Nunca con una promotora', (
    '| Qué | Por qué |\n|---|---|\n'
    '| **Mensual a quien hace pocas fiestas al año** | Le estás diciendo que no entiendes su negocio |\n'
    '| **Vender «para tu local»** | No tiene local |\n'
    '| **Peticiones de canciones en el ángulo underground** | Ahí el que sabe es el artista |\n'
    '| **Perfiles demográficos o CRM** | Roadmap |\n'
    '| **Cifras de lo que puede generar** | No las tenemos |\n'
    '| **Bresh como cliente** | La lleva fundador. Como referencia de que el interés existe, sí se puede contar |\n'
    '| Y todo lo del «nunca» de locales | Kiss-cam, informe post-evento, sin permanencia, 2 € en el recorrido |'))

play('prom-obj-fotos', 'objection', 'objeciones', '«¿Y si las fotos de la gente son malas?»', (
    'Es la objeción real de este sector. Una promotora se cuida el contenido, contrata fotógrafo, y le preocupa que el contenido de móvil '
    'le baje el nivel de marca. **No se rebate diciendo que las fotos están bien. Se reorienta:**\n\n'
    '> «No va de sustituir a tu fotógrafo. Va de que alguien que vino por un amigo y que jamás habría entrado en tu Instagram, entra. '
    'Porque sabe que su foto está ahí. Y la comparte con su grupo.\n>\n'
    '> No tiene por qué ir en el feed. Lo normal es un carrusel: la primera, la del fotógrafo o un diseño que diga "así fue la fiesta del '
    'sábado", y detrás el montaje con las fotos de todo el mundo. O el enlace al álbum en tu linktree para que se las descarguen ellos.»\n\n'
    '**Lo que cambia la conversación:** no es contenido mejor, es **contenido que trae gente a tu perfil**. Una foto profesional no hace '
    'que nadie entre a buscarse.'), objection='desconfianza')

play('prom-durante-despues', 'pitch', 'pitch_demo', 'Contenido durante y contenido después', (
    '**Durante:** material grabable. Alguien que se declara en la pantalla, un reto de solteros con las manos arriba, un match en pantalla '
    'entre dos selfies, el ganador de un reto de fotos. Son TikToks que se graban solos.\n\n'
    '**Después:** el álbum. La gente entra en sus redes a buscarse, comparte con su grupo, y eso es tráfico hacia su perfil en los días en '
    'que ella está vendiendo la siguiente.\n\n'
    '**Las fotos se guardan 30 días.** Dentro de ese plazo se puede poner el enlace del álbum en el linktree o en el Instagram. Pasado el '
    'plazo, si quieren conservarlas tienen que descargarlas ellos. **Decirlo siempre: es parte de la expectativa.**'))

play('prom-agentes-dj', 'tip', 'seguimiento', 'Los agentes de DJ (condiciones PENDIENTES)', (
    'Los agentes de DJ mueven a sus artistas por varias promotoras, y esas promotoras montan en varios locales. **Un agente puede meterte '
    'en promotoras, y esas promotoras te meten en locales.** Es el mismo papel que el DJ colaborador, un escalón más arriba.\n\n'
    '**Lo que traes de vuelta:** si el DJ que trae la promotora tiene agente, el nombre y el contacto.\n\n'
    'Condiciones **PENDIENTES** de definir: no le ofrezcas nada todavía.'))

play('prom-canal-local', 'tip', 'seguimiento', 'La promotora como canal hacia el local', (
    'Esto no se le cuenta a la promotora. Una promotora monta su fiesta con todo, y **el local lo ve funcionar en su propia sala sin haber '
    'pagado nada.** La conversación que viene después no es una venta fría: «oye, lo de Paradox del martes molaba, ¿eso lo puedo tener yo '
    'todos los días?».\n\nPor eso **cada evento de promotora es un lead cualificado de local**, y hay que traer siempre de vuelta en qué '
    'sala monta cada fiesta.\n\n**Idea en estudio, no vendible todavía:** tratar a las promotoras como canal (servicio a cambio de que lo '
    'lleven a locales, o comisión). **No se ofrece a nadie hasta que esté cerrado y autorizado por fundador.**'), audience='team')

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('promotoras:', len(proposal['blocks']), 'bloques ·', len(proposal['choices']), 'elecciones ·', len(proposal['questions']), 'preguntas ·',
      len(nuevas), 'tarifas')
