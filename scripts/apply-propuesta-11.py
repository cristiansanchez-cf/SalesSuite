#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 11 «La propuesta de CONCIERTOS · documento completo»
(docs/ventas/enjoy/fuentes/propuesta-11.md). Sector sin validar: todo es hipótesis. Idempotente.

Tipo de cliente (sala, promotor, artista o manager, agencia, charanga) → ángulo (A, B, D; el C, paquete VIP, bloqueado
hasta saber quién monta los VIP) → condicionales. Tope de 8 (5 en apoyo visual). La pantalla de la barra no se ofrece
hasta que exista el multipantalla.

    python3 scripts/apply-propuesta-11.py
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
        'label': 'A · Rentabilizar', 'portada': 'Tu pantalla, trabajando toda la noche',
        'hint': 'Rentabilizar el aforo que ya tiene. Para sala y promotor.',
        'cards': cards(
            ('Tus pantallas enseñan un logo fijo durante dos horas.', 'Pasan a ser el sitio donde la gente mira a ver si sale.'),
            ('La barra se para entre el telonero y el artista.', 'Lanzas una promoción a la pantalla desde el móvil, en el momento.'),
            ('Tienes patrocinador y solo le puedes dar un logo.', 'Le das una activación en la que la gente participa, y datos de cuánta.')),
    },
    'b': {
        'label': 'B · Conexión', 'portada': 'Que te llegue lo que pasa en la grada de arriba',
        'hint': 'Que el público conecte con el artista. Para artista y manager: se les vende para que no bloqueen, no para que paguen.',
        'cards': cards(
            ('Solo interactúas con las tres primeras filas.', 'Un mensaje desde la grada te llega al panel y lo lees en directo.'),
            ('Una pancarta a sesenta metros no la ve nadie.', 'Lo mandan desde el móvil y sale en pantalla.'),
            ('El público se va sin dejar nada tuyo.', 'Un álbum del concierto, con sus fotos y con las tuyas de camerino.')),
        'note': 'No queremos que la gente esté pegada al móvil. Queremos que lo que haga con él pase en la sala.',
    },
    'd': {
        'label': 'D · El pre-show', 'portada': 'La hora en la que no pasa nada',
        'hint': 'Llenar la hora muerta antes del show. Desactiva la objeción del manager antes de que exista: el artista aún no ha salido. Lo más fácil de aprobar del sector.',
        'cards': None,
    },
}
# C · Paquete VIP: textos literales guardados para cuando se desbloquee (documento 13, preguntas 11 y 12). No se ofrece.
VIP = {
    'portada': 'Un motivo más para comprar la VIP',
    'cards': cards(
        ('Vendes VIP por entrar antes y por una barra privada.', 'Le añades algo que se lleva a casa y que enseña después.'),
        ('El meet & greet no escala: son veinte o cincuenta personas.', 'Esto lo pueden tener los dos mil del VIP.')),
}

# ---------------------------------------------------------------- 03 · encima de vuestros visuales
scenes = {s['scene']: s for s in cat['pantalla-en-vivo']['props']['scenes']}
NDI = ('No sustituimos a vuestro VJ ni tocamos vuestros visuales. Con NDI nos ponemos por encima, en una tarjeta pequeña en un '
       'lateral. Si tenéis ordenador en la señal de vídeo es instalar y conectar; si no, se abre en un navegador.')
# La frase entera va en la entradilla (no cabe en el pie de una escena).
SCENES = [scenes['tp.idle'], scenes['tp.photo'], scenes['club.message'], scenes['club.photo']]

# ---------------------------------------------------------------- 04 · tu público y 05 · lo que te llevas
GENTE = [{'title': 'Lo que va a hacer tu público', 'steps': [
    {'key': 'scan', 'says': 'Apunta con la cámara al QR. Sin descargar nada y sin registrarse.', 'owner': 'Entra todo el mundo, también el que no se baja apps.'},
    {'key': 'sheet', 'says': 'Elige: foto en pantalla, mensaje, o subir al álbum.', 'owner': 'Tres motivos distintos para sacar el móvil durante el concierto.'},
    {'key': 'form', 'label': 'Su mensaje', 'says': 'Escribe su mensaje y lo manda.', 'owner': 'Tu equipo lo aprueba desde su móvil en un segundo.'},
]}]
LLEVAS = [{'title': 'Y lo que te llevas', 'steps': [
    {'key': 'live', 'says': 'Su mensaje sale en pantalla delante de todos.', 'owner': 'Interacción con gente a la que hoy no llegas.'},
    {'key': 'album', 'says': 'Sus fotos quedan en el álbum del concierto.', 'owner': 'Contenido del show con permiso para usarlo.'},
    {'key': 'songs', 'label': 'Participa', 'says': 'Pide, participa, vota.', 'owner': 'Datos de cuánta gente participa y cuándo.'},
]}]
MOVIL = {'lede': '', 'djName': '', 'price': 0}
MENU = 'Metes cinco o seis canciones tuyas y el público elige el cierre del show. Nadie puede pedir nada que no esté en tu lista.'

proposal = {
    'blocks': {
        'portada': {'module': 'portada', 'props': {'eyebrow': 'Propuesta para {company}', 'title': ANGULOS['a']['portada'],
                                                    'subtitle': 'Tu público participa desde el móvil, sale en pantalla, y tú te quedas con el contenido.'}},
        'problema': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que te pasa hoy', 'cards': ANGULOS['a']['cards']}},
        'visuales': {'module': 'pantalla-en-vivo', 'props': {'eyebrow': 'Para producción', 'title': 'Encima de vuestros visuales', 'lede': NDI, 'djName': '', 'scenes': SCENES}},
        'publico': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Tu público', 'title': 'Lo que va a hacer tu público', 'parts': GENTE, 'ownerLabel': 'Lo que significa para ti'}},
        'llevas': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Para ti', 'title': 'Y lo que te llevas', 'parts': LLEVAS, 'ownerLabel': 'Lo que te llevas tú'}},
        'preshow': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Antes del show', 'title': 'El pre-show', 'tabs': [{
            'label': 'Pre-show', 'title': 'La hora en la que no pasa nada',
            'body': 'La hora anterior al artista: público dentro, con el móvil en la mano y una playlist en pantalla.',
            'bullets': ['Álbum con fotos de camerino en tiempo real', '«Contadnos cómo lo estáis viviendo»', 'Reto de marca', 'Mensajes a la grada'],
            'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-mobile.webp', 'alt': 'Álbum del concierto en el móvil'}}]}},
        'menu': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Tu repertorio', 'title': 'El menú cerrado', 'tabs': [{
            'label': 'Menú cerrado', 'title': 'El público elige el cierre', 'body': MENU, 'bullets': [],
            'mock': {'kind': 'image', 'src': 'asset:img/live/request-mobile-2.webp', 'alt': 'El público elige canción desde el móvil'}}]}},
        'marca': {'module': 'lo-que-te-pasa', 'props': {'eyebrow': 'Para tu patrocinador', 'title': 'Para la marca', 'cards': cards(
            ('Tienes patrocinador y solo le puedes dar un logo.', 'Le das una activación en la que la gente participa, y datos de cuánta.'))}},
        'precio': {'module': 'pricing', 'props': {'eyebrow': 'Cómo empezamos', 'title': 'Propuesta para {company}'}},
    },
    'modes': {
        'full': ['portada', 'problema', 'visuales', 'publico', 'llevas', 'preshow', 'precio'],
        'visual': ['visuales', 'publico', 'llevas', 'precio'],
    },
    'max': {'full': 8, 'visual': 5},
    'priority': ['portada', 'problema', 'visuales', 'publico', 'llevas', 'precio', 'menu', 'preshow', 'marca'],
    'choices': [
        {'key': 'tipo', 'label': '¿Qué tipo de cliente es?', 'default': 'sala',
         'hint': ('Sector sin validar: cero ventas cerradas. Sin cobertura en el recinto, no se vende. Hoy manejamos una pantalla: '
                  'acótalo en la primera reunión. Agentes de artistas y de DJ: canal, no cliente; sin propuesta.'),
         'options': [
             {'key': 'sala', 'label': 'Sala de conciertos',
              'hint': 'El más fácil, y por el que se empieza. Gana de barra y compra como un local: suscripción mensual por aforo (249 € / 499 €). Una venta cubre todos los conciertos que pasen por ahí.'},
             {'key': 'promotor', 'label': 'Promotor',
              'hint': 'Margen estrecho y el riesgo encima: nunca como coste de producción. Pregunta «¿de qué partida sale esto?». Con varias fechas al año: pack o suscripción.'},
             {'key': 'artista', 'label': 'Artista o manager',
              'hint': 'Casi nunca deciden, pero pueden vetar por imagen. Se les vende para que no bloqueen, no para que paguen.'},
             {'key': 'agencia', 'label': 'Agencia o management',
              'hint': 'El mejor formato del sector: una venta, muchos eventos. Desde 1.500 €/mes con fechas ilimitadas.'},
             {'key': 'charanga', 'label': 'Charanga, orquesta, tributo o banda',
              'hint': 'La puerta de entrada: deciden ellos y se cierra en días. Sin pantalla no hay propuesta (QR en cartel y venta de palabra). Con pantalla, el menú cerrado es el producto entero.',
              'rules': [{'remove': 'problema'}, {'remove': 'visuales'}, {'remove': 'preshow'}, {'add': 'menu', 'after': 'portada'},
                        {'patch': 'portada', 'set': {'title': '{company}'}}]},
         ]},
        {'key': 'angulo', 'label': '¿Qué le mueve a este cliente?', 'default': 'a', 'when': ['tipo:sala', 'tipo:promotor', 'tipo:artista', 'tipo:agencia'],
         'hint': 'Uno solo. C · Paquete VIP: bloqueado hasta confirmar quién monta los VIP en España.',
         'options': [
             {'key': k, 'label': a['label'], 'hint': a['hint'], 'rules': [{'patch': 'portada', 'set': {'title': a['portada']}}] + (
                 [{'patch': 'problema', 'set': {'cards': a['cards'], **({'note': a['note']} if a.get('note') else {})}}] if a['cards']
                 else [{'remove': 'problema'}])}
             for k, a in ANGULOS.items()
         ]},
    ],
    'questions': [
        {'key': 'menu', 'label': '¿El artista quiere el menú cerrado como reto?', 'when': ['tipo:sala', 'tipo:promotor', 'tipo:artista', 'tipo:agencia'],
         'rules': [{'add': 'menu', 'after': 'llevas', 'before': ['preshow', 'precio']}]},
        {'key': 'patrocinador', 'label': '¿Hay patrocinador?', 'hint': 'Esta conversación la lleva fundador: tú no cierras con la marca.',
         'when': ['tipo:sala', 'tipo:promotor', 'tipo:artista', 'tipo:agencia'],
         'rules': [{'add': 'marca', 'after': ['preshow', 'llevas'], 'before': 'precio'}]},
    ],
}

for sg in t['market']:
    if sg['key'] == 'conciertos':
        sg['proposal'] = proposal
        sg['deal_size'] = ('Sala de conciertos: suscripción mensual de 249 € o 499 € según aforo, como un local. Por fecha: 600–2.500 € según aforo. '
                           'Charangas 120 € el evento. Agencia desde 1.500 €/mes. Todo sin validar.')
        if 'Salas de conciertos: el más fácil' not in sg['icp']:
            sg['icp'] = '- Salas de conciertos: el más fácil, compran como un local (suscripción) y ganan de barra\n' + sg['icp']

# ---------------------------------------------------------------- tarifas: la sala, por suscripción como un local
SUS = [{'label': 'Sala de conciertos · suscripción (150–500)', 'amount': 249, 'default': True},
       {'label': 'Sala de conciertos · suscripción (más de 500)', 'amount': 499, 'default': False}]
labels = {o['label'] for o in t['price_options']}
at = next(i for i, o in enumerate(t['price_options']) if o.get('segment') == 'conciertos')
for s in reversed(SUS):
    if s['label'] not in labels:
        t['price_options'].insert(at, {'label': s['label'], 'amount': s['amount'], 'currency': 'EUR', 'period': 'month', 'segment': 'conciertos',
                                       'kind': 'Sala de conciertos · suscripción', 'default': s['default']})

# ---------------------------------------------------------------- jugadas
plays = {p['key']: p for p in t['playbook']}


def play(key, kind, stage, title, body, audience='all', objection=None):
    base = {'key': key, 'module_key': None, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': ['conciertos'],
            'personas': [], 'audience': audience, 'about': False, 'pinned': None, 'title': title, 'body': body,
            'when_to_use': None, 'why_it_works': None, 'technique_refs': [], 'status': 'official'}
    if key in plays:
        plays[key].update({k: base[k] for k in ('kind', 'stage', 'objection', 'audience', 'title', 'body')})
    else:
        t['playbook'].append(base)
        plays[key] = base


play('conc-dinero', 'fit', 'descubrimiento', 'Cómo funciona el dinero en un concierto', (
    'Un comercial que no sepa esto va a pedirle dinero a quien no lo tiene.\n\n'
    '- El artista cobra **caché**, y muchas veces caché **más un porcentaje del neto de taquilla**: lo habitual, entre el **75 % y el 85 % del neto**.\n'
    '- **La SGAE se lleva el 8,5 % de la recaudación de taquilla.**\n'
    '- De lo que le queda al promotor salen recinto, publicidad, logística y personal. **El riesgo es suyo:** si no llena, el caché se paga igual.\n\n'
    '| De dónde salen los ingresos de una gira | Peso aproximado |\n|---|---|\n'
    '| Venta de entradas | 60-75 % |\n| Merchandising | 15-30 % |\n| **Experiencias VIP** | **3-10 %** |\n| Patrocinios | 0-8 % |\n| Otros | 1-5 % |\n\n'
    '**Los cuatro bolsillos:**\n\n| Quién paga | Cuándo tiene sentido |\n|---|---|\n'
    '| **La marca patrocinadora** | Siempre que haya patrocinador. **Lo lleva fundador** |\n'
    '| **El público, vía paquete VIP** | Giras y salas que ya venden VIP (bloqueado hasta confirmar quién los monta) |\n'
    '| **La sala** | Gana de barra, con márgenes del 70-80 % en consumiciones. Comprador distinto del promotor |\n'
    '| **El promotor**, de su partida de promoción | Solo si lo ve como marketing para vender entradas, no como producción |\n\n'
    '*Datos de sector con fuentes en el documento 11. Sin validar en campo.*'))

play('conc-tipos', 'fit', 'prospeccion', 'Tipos de cliente en conciertos', (
    '**Sala de conciertos: el más fácil, y por el que se empieza.** Programa de forma recurrente, tiene pantallas propias y gana de barra. '
    'Vive en el ecosistema de conciertos pero **compra como un local**: suscripción, y el argumento de barra pesa más que el de contenido. '
    'Nada de DJ residente ni de menú cerrado: aquí manda la producción del show.\n\n'
    '**Promotor.** Asume el riesgo y decide si entra algo nuevo. Margen estrecho: llévale el dinero de otro bolsillo o entra por su partida de promoción.\n\n'
    '**Artista y manager.** Casi nunca deciden, pero pueden vetar por imagen. Se les vende para que no bloqueen, no para que paguen.\n\n'
    '**Agencia o management con varios artistas.** El mejor formato del sector: una venta, muchos eventos.\n\n'
    '**Charangas, orquestas, tributos y bandas.** Deciden ellos y se cierra en días: la puerta de entrada. Sin pantalla no hay propuesta.'))

play('conc-agentes', 'tip', 'seguimiento', 'Agentes de artistas y de DJ: canal, no cliente', (
    'Mueven a sus artistas por varias salas y promotores. **Un agente te mete en promotores y esos te meten en salas.**\n\n'
    '**Lo que traes:** nombre, con qué artistas trabaja y en qué salas tocan.\n\n'
    'Condiciones **PENDIENTES**: hoy no se le ofrece nada por escrito.'))

play('conc-partida', 'monetization', 'negociacion', '«¿De qué partida sale esto?»', (
    'La pregunta que decide la venta no es «¿te interesa?», es:\n\n> «¿De qué partida sale esto?»\n\n'
    'Va con el precio. Si la respuesta es «de la mía», se mira si entra en promoción. Si es «no tengo», se mira marca o VIP.\n\n'
    '**Nunca** le vendas al promotor como un coste de producción más.'))

play('conc-precio-tabla', 'tip', 'negociacion', 'Precios de conciertos', (
    '| Formato | PVP |\n|---|---|\n'
    '| Charanga u orquesta · evento | 120 € |\n| Charanga u orquesta · temporada mayo-septiembre | 390 € |\n'
    '| Sala hasta 1.000 · evento | 600 € |\n| Sala 1.000-5.000 · evento | 1.200 € |\n| Sala 5.000-20.000 · evento | 2.500 € |\n'
    '| **Sala de conciertos · suscripción mensual** | **249 € / 499 € según aforo, como un local** |\n'
    '| Pack 5 fechas | −20 % |\n| Agencia o promotora · fechas ilimitadas | desde 1.500 €/mes |\n'
    '| +20.000 | A medida, **solo tras prueba de carga** |\n\n'
    '**Siempre antes del precio, el ancla** (la kiss cam clásica de 8.000 € por noche). **Suelo: 500 € por evento en sala, 90 € en charanga.** '
    'Por debajo, fundador. Precios sin validar.'))

play('conc-una-pantalla', 'tip', 'descubrimiento', 'Hoy manejamos una pantalla', (
    'Hoy un mismo contenido va a todas las pantallas del evento. **Nunca prometas varias.** Se acota desde la primera reunión:\n\n'
    '> «Hoy manejamos una pantalla. Lo que tenemos que decidir es en cuál y en qué momento.»\n\n'
    '**La pantalla de la barra** (promociones y felicitaciones sin tocar la del escenario) está **bloqueada hasta que exista el multipantalla**. '
    'Prometerlo antes de tiempo es exactamente el error que nos ha costado clientes.'))

play('conc-datos', 'tip', 'pitch_demo', 'Los datos: a quién le importan de verdad', (
    '| Quién | ¿Le sirven? |\n|---|---|\n'
    '| **La sala** | **Sí.** Cien noches al año, misma ciudad, mismo público |\n'
    '| **El promotor** | **Sí.** Repite ciudad cada temporada |\n'
    '| **El artista en gira** | **No.** Pasa por una ciudad una vez y vuelve en dos años |\n'
    '| **La marca** | **Es lo que más valora.** Es con lo único que justifica su inversión |\n\n'
    'El remarketing se le vendería a quien repite en ese recinto. **Y hoy no se vende a nadie: es roadmap.**'))

play('conc-vip', 'tip', 'mentalidad', 'El paquete VIP (BLOQUEADO)', (
    'Una entrada VIP cuesta entre un 80 % y un 150 % más que la general y supone del 5 % al 15 % de las entradas vendidas. '
    '**Si Enjoy entra en el paquete VIP, lo paga el fan.**\n\n'
    'Se montaría con dos QR: uno general (álbum y foto en pantalla) y otro VIP (mensaje al artista con prioridad, álbum de camerino, '
    'su foto en el álbum oficial).\n\n**Lo que falta por validar es quién lo compra.** Si en España los VIP los monta una empresa de '
    'hospitality y no el promotor, se le vende a esa empresa. **No se vende hasta confirmarlo** (documento 13, preguntas 11 y 12).'),
     audience='team')

play('conc-nunca', 'tip', 'mentalidad', 'Nunca en conciertos', (
    '| Qué | Por qué |\n|---|---|\n'
    '| **Vender a un promotor como coste de producción** | Margen estrecho y riesgo propio |\n'
    '| **Prometer que duplica el patrocinio** | La palanca existe, el número no |\n'
    '| **Vender +20.000 sin prueba de carga** | Un «votad todos» nos tumba el servicio |\n'
    '| **Vender donde no hay cobertura** | Un evento fallido se cuenta entre promotores |\n'
    '| **Prometer varias pantallas** | Hoy es una |\n'
    '| **El ángulo VIP** | Hasta confirmar quién los monta |\n'
    '| **Proponer subir gente al escenario** | Seguridad y responsabilidad civil |\n'
    '| **Señalar a una persona concreta en pantalla** | Aceptó subir su mensaje, no que 3.000 personas la busquen |\n'
    '| **Vídeo en directo** | No existe |\n'
    '| **Decir que algo va automático** | Todo lleva validación manual. «Siempre hay validación manual, es como sabes seguro lo que sale en tu pantalla». Punto |\n'
    '| **Cerrar con marcas** | Lo lleva fundador |\n'
    '| **CRM, remarketing, perfiles demográficos** | Roadmap |'))

play('conc-ndi', 'pitch', 'pitch_demo', 'A producción: NDI', '> «' + NDI + '»\n\n**Es la primera objeción técnica siempre.** Va contestada antes de que la hagan.')

if 'cinco o seis canciones' not in plays['conc-menu-cerrado']['body']:
    plays['conc-menu-cerrado']['body'] += '\n\n**Para un artista que lo quiera como reto:**\n\n> «' + MENU + '»'

PREVIO = plays['conc-pendiente']['body'].split('\n\n**De antes:**\n\n')[-1] if 'conc-pendiente' in plays else ''
play('conc-pendiente', 'tip', 'mentalidad', 'Lo que falta para vender sin miedo', (
    '| Qué | Bloquea |\n|---|---|\n'
    '| Reunión con Bruno (documento 13) | Quién decide, quién controla la pantalla, de qué partida sale, quién monta los VIP |\n'
    '| Multipantalla (unos cinco días de desarrollo) | La pantalla de la barra |\n'
    '| Prueba de carga | Todo lo de +20.000 |\n'
    '| Un caso de éxito en concierto | No hay ninguno. El piloto con un artista de Balaunka sería el primero |\n'
    '| Precio real de charangas | 120/390 € es propuesta |\n'
    '| Condiciones de agentes y colaboradores | Hoy no se puede ofrecer nada por escrito |'
    + ('\n\n**De antes:**\n\n' + PREVIO if PREVIO and not PREVIO.startswith('| Qué') else '')), audience='team')

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('conciertos:', len(proposal['blocks']), 'bloques ·', len(proposal['choices']), 'elecciones ·', len(proposal['questions']), 'preguntas')
