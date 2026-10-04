#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 15 «La propuesta de FESTIVALES · documento completo»
(docs/ventas/enjoy/fuentes/propuesta-15.md). Sector sin validar; hereda de conciertos (11 y 11-bis) lo que no se
contradice. Idempotente.

Tipo de cliente (recinto, festival mediano, festival grande, infraestructura de temporada) → ángulo (A–D) →
condicionales (encima de vuestros visuales, para tu patrocinador, acompañamiento la primera edición). Tope de 8.

    python3 scripts/apply-propuesta-15.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}


def cards(*pairs):
    return [{'problem': a, 'solution': b} for a, b in pairs]


# ---------------------------------------------------------------- ángulos (sección 3), literales
ANGULOS = {
    'a': {
        'label': 'A · La barra', 'portada': 'Tu pantalla, vendiendo',
        'hint': 'Que la barra no pare. Para el recinto y los festivales con barra propia: el que mejor conocemos, porque es el de los locales.',
        'cards': cards(
            ('Entre concierto y concierto la barra se vacía y no puedes hacer nada.', 'Mandas a la pantalla "los próximos diez minutos, dos por uno", desde tu móvil.'),
            ('Tus pantallas enseñan un logo fijo durante horas.', 'Pasan a ser el sitio donde la gente mira a ver si sale.'),
            ('Tienes cinco zonas y solo controlas lo que suena.', 'Contenido distinto en cada pantalla: escenario, barras, accesos.')),
    },
    'b': {
        'label': 'B · Inventario patrocinable', 'portada': 'Lo que tu patrocinador no puede comprar en otro sitio',
        'hint': 'Rentabilizar mejor a sus patrocinadores. Festival grande. Nunca prometas una cifra de aumento de patrocinio: la palanca existe, el número no. Entra siempre «Para tu patrocinador».',
        'cards': cards(
            ('A tu marca le das un logo y un photocall.', 'Le das una activación en la que la gente participa.'),
            ('Te piden medir el retorno y no tienes con qué.', 'Datos de cuánta gente participa, cuándo y en qué.'),
            ('Cada año te piden más por el mismo dinero.', 'Algo que no estaba en el paquete del año pasado.')),
    },
    'c': {
        'label': 'C · Diferenciarse', 'portada': 'Que no te comparen solo por el cartel',
        'hint': 'Festival mediano independiente. Nunca digas que el sector está en caída ni insinúes que está en apuros.',
        'cards': cards(
            ('Tu cartel se parece al de otros tres festivales del mismo mes.', 'Algo que pasa en el tuyo y en el de al lado no.'),
            ('La gente llega, ve el concierto y se va.', 'Participan, salen en pantalla y se llevan el álbum del festival.'),
            ('El contenido de tus redes lo produces tú.', 'Cientos de fotos de tu público, con permiso para usarlas.')),
    },
    'd': {
        'label': 'D · Que vuelvan al recinto', 'portada': 'Que el de junio vuelva en septiembre',
        'hint': ('Para el recinto. Avisar a los de la última edición NO existe todavía: nunca en el dossier ni en el precio; solo en conversación, '
                 'con fecha y por contrato (jugada «Las comunicaciones al público»).'),
        # La tarjeta «No tienes forma de avisar a los de la última edición» no lleva solución en el dossier (sección 6): no sale.
        'cards': cards(
            ('Cada evento empieza de cero: no sabes quién vino al anterior.', 'Ves quién participó, qué pidió y cuándo.'),
            ('Tu recinto es el sitio, pero la gente recuerda el festival.', 'Un álbum de la noche con tu recinto dentro.')),
    },
}

# ---------------------------------------------------------------- 03 · tus pantallas, por zonas
scenes = {s['scene']: s for s in cat['pantalla-en-vivo']['props']['scenes']}
ZONAS = 'Contenido distinto en cada pantalla: una cosa en el escenario, otra en las barras, otra en los accesos. Todo desde el móvil.'
FOTO = {**scenes['club.photo'], 'says': 'Su foto en grande y entera (nunca se recorta una cara). Y se queda en el álbum del festival.'}
SCENES = [scenes['club.idle'], FOTO, scenes['club.message'], scenes['club.song']]
PROMO = {'scene': 'club.promo', 'label': 'Tu mensaje', 'text': 'Los próximos diez minutos, dos por uno',
         'says': 'Mandas a la pantalla "los próximos diez minutos, dos por uno", desde tu móvil.'}
NDI = ('No sustituimos a vuestro VJ ni tocamos vuestros visuales. Con NDI nos ponemos por encima, en una tarjeta pequeña en un '
       'lateral. Si tenéis ordenador en la señal de vídeo es instalar y conectar; si no, se abre en un navegador.')

# ---------------------------------------------------------------- 04 · tu público y 05 · lo que te llevas (de conciertos)
GENTE = [{'title': 'Lo que va a hacer tu público', 'steps': [
    {'key': 'scan', 'says': 'Apunta con la cámara al QR. Sin descargar nada y sin registrarse.', 'owner': 'Entra todo el mundo, también el que no se baja apps.'},
    {'key': 'sheet', 'says': 'Elige: foto en pantalla, mensaje, o subir al álbum.', 'owner': 'Tres motivos distintos para sacar el móvil durante el festival.'},
    {'key': 'form', 'label': 'Su mensaje', 'says': 'Escribe su mensaje y lo manda.', 'owner': 'Tu equipo lo aprueba desde su móvil en un segundo.'},
]}]
LLEVAS = [{'title': 'Y lo que te llevas', 'steps': [
    {'key': 'live', 'says': 'Su mensaje sale en pantalla delante de todos.', 'owner': 'Interacción con gente a la que hoy no llegas.'},
    {'key': 'album', 'says': 'Sus fotos quedan en el álbum del festival.', 'owner': 'Contenido del festival con permiso para usarlo.'},
    {'key': 'songs', 'label': 'Participa', 'says': 'Pide, participa, vota.', 'owner': 'Datos de cuánta gente participa y cuándo.'},
]}]
MOVIL = {'lede': '', 'djName': '', 'price': 0}
ACOMPANAMIENTO = '«En la primera edición vamos nosotros allí. No porque haya que montar nada, sino porque va a haber preguntas y prefiero estar.»'
TODOS = ['tipo:recinto', 'tipo:mediano', 'tipo:grande', 'tipo:infraestructura']

proposal = {
    'blocks': {
        'portada': {'module': 'portada', 'props': {'eyebrow': 'Propuesta para {company}', 'title': ANGULOS['a']['portada'],
                                                    'subtitle': 'Tu público participa desde el móvil, sale en pantalla, y tú te quedas con el contenido.'}},
        'problema': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que te pasa hoy', 'cards': ANGULOS['a']['cards']}},
        'zonas': {'module': 'pantalla-en-vivo', 'props': {'eyebrow': 'Tus pantallas', 'title': 'Tus pantallas, por zonas', 'lede': ZONAS, 'djName': '', 'scenes': SCENES}},
        'publico': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Tu público', 'title': 'Lo que va a hacer tu público', 'parts': GENTE, 'ownerLabel': 'Lo que significa para ti'}},
        'llevas': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Para ti', 'title': 'Y lo que te llevas', 'parts': LLEVAS, 'ownerLabel': 'Lo que te llevas tú'}},
        'visuales': {'module': 'pantalla-en-vivo', 'props': {'eyebrow': 'Para producción', 'title': 'Encima de vuestros visuales', 'lede': NDI, 'djName': '',
                                                              'scenes': [scenes['tp.idle'], scenes['tp.photo']]}},
        'patrocinador': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Para tu patrocinador', 'title': 'Para tu patrocinador', 'tabs': [{
            'label': 'Patrocinador', 'title': 'Interacción, no espacio',
            'body': 'Un patrocinador ya no compra espacio, compra interacción.',
            'bullets': ['Una activación en la que la gente participa', 'Datos de cuánta gente participa, cuándo y en qué'],
            'mock': {'kind': 'image', 'src': 'asset:img/tabs/messages-screen.webp', 'alt': 'El público participa en la pantalla'}}]}},
        'acompanamiento': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'La primera edición', 'title': 'Acompañamiento la primera edición', 'tabs': [{
            'label': 'Primera edición', 'title': 'Vamos nosotros', 'body': ACOMPANAMIENTO, 'bullets': []}]}},
        'precio': {'module': 'pricing', 'props': {'eyebrow': 'Cómo empezamos', 'title': 'Propuesta para {company}'}},
    },
    'modes': {
        'full': ['portada', 'problema', 'zonas', 'publico', 'llevas', 'precio'],
        'visual': ['zonas', 'publico', 'llevas', 'precio'],
    },
    'max': {'full': 8, 'visual': 5},
    'priority': ['portada', 'problema', 'zonas', 'publico', 'llevas', 'precio', 'patrocinador', 'visuales', 'acompanamiento'],
    'choices': [
        {'key': 'tipo', 'label': '¿Qué tipo de cliente es?', 'default': 'recinto',
         'hint': ('Sector sin validar: cero ventas cerradas. Busca el independiente sano, no el que está en apuros: un festival que está cancelando '
                  'es un impago. Sin cobertura, no se vende. Las conversaciones con marcas (modelo B) las lleva fundador.'),
         'options': [
             {'key': 'recinto', 'label': 'Recinto',
              'hint': 'Quien pone el espacio: tiene la barra, acoge varios festivales al año y quiere que la gente vuelva. Suscripción de temporada, desde 1.500 €/mes. Por donde se empieza el sector.'},
             {'key': 'mediano', 'label': 'Festival mediano independiente',
              'hint': 'Angustia de diferenciarse, decisión rápida, bolsillo pequeño. Modelo A: paga él. 1.200 € hasta 5.000 personas, 2.500 € hasta 20.000.'},
             {'key': 'grande', 'label': 'Festival grande o de grupo',
              'hint': 'Rentabilidad y estructura. Ciclo largo, varios niveles de decisión. Inventario patrocinable y datos. Más de 20.000: a medida y solo tras prueba de carga.'},
             {'key': 'infraestructura', 'label': 'Infraestructura de temporada',
              'hint': 'Tipo Selvatic Fest: opera todo el verano con conciertos y festivales pequeños dentro. Suscripción de temporada, desde 1.500 €/mes.'},
         ]},
        {'key': 'angulo', 'label': '¿Qué le mueve a este cliente?', 'default': 'a', 'hint': 'Uno solo.',
         'options': [
             {'key': k, 'label': a['label'], 'hint': a['hint'], 'rules': [
                 {'patch': 'portada', 'set': {'title': a['portada']}},
                 {'patch': 'problema', 'set': {'cards': a['cards']}},
             ] + {
                 'a': [{'insert': 'zonas', 'into': 'scenes', 'at': 1, 'value': PROMO}],
                 'b': [{'add': 'patrocinador', 'after': 'llevas', 'before': 'precio'}],
             }.get(k, [])}
             for k, a in ANGULOS.items()
         ]},
    ],
    'questions': [
        {'key': 'vj', 'label': '¿Tiene VJ o realización propia?', 'hint': 'Va contestada antes de que pregunten: es la primera objeción técnica.',
         'rules': [{'add': 'visuales', 'after': ['patrocinador', 'llevas'], 'before': 'precio'}]},
        {'key': 'patrocinador', 'label': '¿Tiene patrocinadores?', 'hint': 'La conversación con la marca la lleva fundador. Tú detectas qué marca, quién lleva la relación y si nos presentan.',
         'when': ['angulo:a', 'angulo:c', 'angulo:d'], 'rules': [{'add': 'patrocinador', 'after': 'llevas', 'before': 'precio'}]},
        {'key': 'primera', 'label': '¿Es su primera edición con nosotros?',
         'hint': 'Excepción de festivales: en la primera edición vamos. No en ediciones siguientes, y no va en el precio como incluido.',
         'rules': [{'add': 'acompanamiento', 'after': ['visuales', 'patrocinador', 'llevas'], 'before': 'precio'}]},
    ],
}

for sg in t['market']:
    if sg['key'] == 'festivales':
        sg['proposal'] = proposal
        sg['deal_size'] = ('Recinto o infraestructura de temporada: desde 1.500 €/mes. Festival hasta 5.000: 1.200 €; de 5.000 a 20.000: 2.500 €; '
                           'más de 20.000, a medida tras prueba de carga. Activación de marca (modelo B) desde 3.000 €. Todo sin validar.')
        if 'Recintos que acogen' not in sg['icp']:
            sg['icp'] = ('- Recintos que acogen varios festivales y eventos al año: tienen la barra y quieren que la gente vuelva\n'
                         '- Infraestructuras de temporada que operan todo el verano\n- Festivales independientes sanos: repiten edición, venden con antelación, '
                         'patrocinadores recurrentes, pagan a tiempo\n' + sg['icp'])

# ---------------------------------------------------------------- tarifas: el recinto, por temporada
if not any(o['label'] == 'Recinto · suscripción de temporada' for o in t['price_options']):
    at = next(i for i, o in enumerate(t['price_options']) if o.get('segment') == 'festivales')
    t['price_options'].insert(at, {'label': 'Recinto · suscripción de temporada', 'amount': 1500, 'currency': 'EUR', 'period': 'month',
                                   'segment': 'festivales', 'kind': 'Recinto', 'default': True, 'note': 'Desde 1.500 €/mes'})

# ---------------------------------------------------------------- jugadas
plays = {p['key']: p for p in t['playbook']}


def play(key, kind, stage, title, body, audience='all', objection=None):
    base = {'key': key, 'module_key': None, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': ['festivales'],
            'personas': [], 'audience': audience, 'about': False, 'pinned': None, 'title': title, 'body': body,
            'when_to_use': None, 'why_it_works': None, 'technique_refs': [], 'status': 'official'}
    if key in plays:
        plays[key].update({k: base[k] for k in ('kind', 'stage', 'objection', 'audience', 'title', 'body')})
    else:
        t['playbook'].append(base)
        plays[key] = base


play('fest-sector', 'fit', 'descubrimiento', 'Cómo está el sector', (
    '**No está hundido: está partido en dos.** La música en vivo facturó más de **807 M€** en entradas, un **+11,2 %**. A la vez, una veintena '
    'de festivales se han cancelado este año por viabilidad.\n\n**La concentración:** Superstruct (comprada por KKR por 1.300 M€) opera unos 30 '
    'festivales en España: FIB, Arenal Sound, Sónar, Les Arts, SanSan.\n\n- **Festival grande o de grupo:** no tiene problema de supervivencia; '
    'tiene objetivos de rentabilidad y decisiones que pasan por estructura.\n- **Festival mediano independiente:** angustia de viabilidad real.\n\n'
    '**De dónde sale su dinero** (grandes eventos en España): 57 % entradas, 11 % patrocinios, 7 % ayudas públicas. **El patrocinio es una línea '
    'minoritaria:** útil, pero no es la palanca principal de un festival grande. Lo que sí sube su valor: **un patrocinador ya no compra espacio, '
    'compra interacción.**\n\n*Fuentes en el documento 15. Sin validar en campo.*'))

play('fest-sano', 'fit', 'prospeccion', 'Busca al sano, no al que se está muriendo', (
    'Un festival que está cancelando **no es un cliente, es un impago.**\n\nSeñales de sano: **repite edición desde hace años, vende entradas con '
    'antelación, tiene patrocinadores recurrentes, paga a proveedores a tiempo.**'))

play('fest-tipos', 'fit', 'prospeccion', 'Tipos de cliente en festivales', (
    '**El recinto: el cliente recurrente, y el que más se nos escapaba.** No es el festival: es quien pone el espacio. **Tiene la barra** (márgenes '
    'del 70-80 % en consumiciones), **acoge varios festivales al año** (una venta, muchos eventos) y **quiere que la gente vuelva a su recinto**. '
    'Suscripción de temporada. Hereda casi todo de la sala de conciertos. **Es por donde se empieza el sector:** el festival pasa una vez al año; '
    'el recinto está todo el año.\n\n**Festival mediano independiente.** Angustia de diferenciarse, decisión rápida, bolsillo pequeño. Paga él.\n\n'
    '**Festival grande o de grupo.** Rentabilidad y estructura. Ciclo largo, varios niveles de decisión.\n\n**Infraestructura de temporada** '
    '(tipo Selvatic Fest): opera todo el verano. Suscripción de temporada; el mejor formato después del recinto.'))

play('fest-modelo-b', 'pitch', 'pitch_demo', 'Llegamos con la marca detrás', (
    '> «A ti no te cuesta. Lo paga la marca. Lo que tenemos que ver es cuánto te interesa a ti que lo pongamos.»\n\n'
    'El festival deja de preguntarse cuánto le cuesta y pasa a preguntarse cuánto le dan. **De gasto a ingreso.**\n\n'
    '**Las conversaciones con marcas las lleva fundador.** Tú detectas qué marca patrocina cada festival, quién lleva esa relación y si nos '
    'presentan, y lo pasas. **Eso es todo tu trabajo en el modelo B, y es mucho.**'))

play('fest-precio-tabla', 'tip', 'negociacion', 'Precios de festivales', (
    '| Formato | PVP |\n|---|---|\n| Festival pequeño o de un día (hasta 5.000) | 1.200 € |\n| Festival mediano (5.000-20.000) | 2.500 € |\n'
    '| Festival grande (+20.000) | A medida, **solo tras prueba de carga** |\n| **Recinto · suscripción de temporada** | **desde 1.500 €/mes** |\n'
    '| Infraestructura de temporada | desde 1.500 €/mes |\n| Activación de marca (modelo B) | desde 3.000 € |\n\n'
    '**El ancla, siempre antes:** una kiss cam clásica con pantalla, cámara y operario no baja de 8.000 € por evento, y cuando acaba no queda nada.'))

play('fest-descuento', 'tip', 'negociacion', 'Descuento y suelo en festivales', (
    '**Descuento máximo primer año: 50 %**, solo a cambio de caso con nombre, material grabado y derecho de tanteo en la edición siguiente.\n\n'
    '**Suelo: 800 € por evento.** Por debajo, fundador.'), audience='team')

play('fest-comunicaciones', 'tip', 'negociacion', 'Las comunicaciones al público: solo con condiciones', (
    'Para un recinto, poder avisar a quien vino a la última edición es un argumento muy fuerte. **No existe todavía: está previsto para el verano '
    'que viene.** Se puede vender, pero solo así:\n\n1. **Nunca en el dossier ni en el precio.** El dossier vende lo que hay hoy.\n'
    '2. **Solo en conversación**, y como compromiso con fecha: «para la edición de [mes] lo tendréis».\n'
    '3. **Si es decisivo para que firme, va en el contrato con fecha de entrega.** Si no está para esa fecha, el cliente tiene derecho a algo '
    '(meses sin cuota, devolución, lo que se pacte).\n4. **Si no se puede poner por escrito, no se promete.**\n\n'
    'La única vez que vendimos algo que todavía no existía, perdimos clientes cuando no se cumplió. Ponerlo por escrito es lo que convierte '
    'una promesa en un compromiso.'))

play('fest-presencial', 'script', 'cierre', 'El acompañamiento la primera vez', (
    '> ' + ACOMPANAMIENTO + '\n\n**Excepción de festivales y se dice como tal.** No se promete en locales, ni en conciertos de sala, ni en '
    'ediciones siguientes. Y **no va en el módulo de precio como incluido**.'))

play('fest-cuando', 'tip', 'prospeccion', 'Cuándo se llama', (
    '| Periodo | Qué hacer |\n|---|---|\n| Mayo-septiembre | Temporada, pico junio-agosto. **Imposible vender** |\n'
    '| **Septiembre-noviembre** | **La ventana.** Las grandes cuentas cierran presupuesto del año siguiente |\n'
    '| Noviembre-diciembre | Partidas de marketing sin ejecutar que se pierden |\n| Enero-abril | Se cierran carteles y producción |\n\n'
    '«Lo vemos el año que viene» es la respuesta normal en temporada, y se convierte en fecha:\n\n'
    '> «Me parece lo lógico. ¿Te va bien que te llame el [día concreto]? Lo apunto y no te molesto hasta entonces.»'))

play('fest-canal', 'tip', 'prospeccion', 'Cómo se entra de verdad en este sector', (
    'No se entra por puerta fría. Se entra por quien ya está dentro:\n\n- **Agentes de artistas** (Bruno, Balaunka). Mueven artistas por festivales y recintos.\n'
    '- **El comercial de conciertos.** Los mismos interlocutores sirven para los dos sectores.\n- **Agencias de patrocinio.** Una puede abrir varios festivales a la vez.\n'
    '- **Marcas**, en modelo B. Lo lleva fundador.\n\n**Si alguno nos hace una intro, se recompensa.** Las condiciones de colaborador están pendientes: '
    'hoy no se ofrece nada por escrito. «Lo tenemos montado para gente como tú, te lo paso cuando lo cerremos.»'), audience='team')

play('fest-historial', 'tip', 'seguimiento', 'Historial: todos dijeron que sí', (
    '- **Deep Delay:** marca que opera varios festivales. Al gerente le gustaron sobre todo las peticiones de canciones. **Pidieron retomarlo en '
    'septiembre: pendiente de llamar. La ventana se cierra en noviembre.**\n'
    '- **Selvatic Fest:** dijo que sí. Infraestructura que opera todo el verano. Nunca se acordó precio; buscaban un primer año gratis a cambio de validación.\n'
    '- **Topamin Fest:** quería ponerlo. Por su número de marcas, perfil claro de modelo A o B.\n'
    '- **Shark Events:** dijo que sí; habían probado antes a un competidor que no funcionó.\n- **B-Combinator Fest (caseta):** funcionó.\n\n'
    '**Ninguno se perdió por precio, producto ni competencia. Todos por no hacer seguimiento.**'), audience='team')

play('fest-no-vender', 'tip', 'mentalidad', 'Nunca en festivales', (
    '| Qué | Por qué |\n|---|---|\n| **Vender a un festival que está cancelando** | No es un cliente, es un impago |\n'
    '| **Decirle a un festival grande que el sector está en caída** | Él está creciendo |\n'
    '| **Prometer un aumento del patrocinio con número** | La palanca existe, el número no |\n'
    '| **Vender +20.000 sin prueba de carga** | Un «votad todos» nos tumba el servicio |\n'
    '| **Vender sin comprobar cobertura** | Es el riesgo real en campo |\n'
    '| **Las comunicaciones al público** | Solo con las condiciones de su jugada |\n'
    '| **«Encuentra y gana»** | Previsto para 2027. No existe |\n| **Cerrar con marcas** | Lo lleva fundador |\n'
    '| **Decir que algo va automático** | Todo lleva validación manual |'))

play('fest-pendiente', 'tip', 'mentalidad', 'Pendientes de festivales', (
    '| Qué | Estado |\n|---|---|\n| **Llamar a Deep Delay** | Lo pidieron para septiembre. **La ventana se cierra en noviembre** |\n'
    '| Prueba de carga | Todo lo de +20.000 |\n| Un caso de éxito en festival | No hay ninguno |\n'
    '| Condiciones de colaborador | Hoy no se ofrece nada por escrito |\n'
    '| Fecha real de las comunicaciones al público | Sin ella no se puede comprometer por contrato |'), audience='team')

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('festivales:', len(proposal['blocks']), 'bloques ·', len(proposal['choices']), 'elecciones ·', len(proposal['questions']), 'preguntas')
