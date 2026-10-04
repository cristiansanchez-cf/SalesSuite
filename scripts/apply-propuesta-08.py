#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 08 «La propuesta de LOCALES · documento completo»
(docs/ventas/enjoy/fuentes/propuesta-08.md). Sustituye a la receta del 07. Idempotente.

Tipo de cliente (estándar, grupo, revende para privados) → ángulo (A–F, uno solo) → condicionales, con tope de 8
módulos (5 en apoyo visual) y prioridad para recortar. Textos literales del 08.

    python3 scripts/apply-propuesta-08.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}

# ---------------------------------------------------------------- catálogo
CASO_NOMBRE = ('La Biblioteca es un pub de ocio nocturno de Málaga, de unas 300 personas. Una promotora de eventos eligió su local '
               'para montar una fiesta porque podían ofrecer estas dinámicas y otros no. Una fiesta más es facturación que antes no estaba.')
CASO_ANON = ('A un pub de ocio nocturno de Málaga, de unas 300 personas, una promotora de eventos lo eligió para montar una fiesta '
             'porque podía ofrecer estas dinámicas y otros no. Una fiesta más es facturación que antes no estaba.')
cat['caso-real']['props'] = {'eyebrow': 'Un caso real', 'title': 'Una promotora los eligió a ellos',
                             'client': 'Un pub de Málaga', 'place': 'unas 300 personas', 'body': CASO_ANON}
cat['caso-real']['description'] = 'Un cliente parecido, con qué es, dónde está y su tamaño. Con nombre solo con autorización por escrito.'
cat['lo-que-ya-te-cuesta'] = {
    'key': 'lo-que-ya-te-cuesta', 'block_type': 'cost-math', 'name': 'Lo que ya te cuesta', 'is_catalog': True,
    'default_price': None, 'currency': 'EUR',
    'description': 'La cuenta con las cifras que dio el cliente (pregunta 3). Sin cifras no sale: nunca se inventa una.',
    'props': {'title': 'Lo que ya te cuesta'},
}
order = ['portada', 'lo-que-te-pasa', 'pantalla-en-vivo', 'movil-invitado', 'tabs-experiencias', 'lo-que-ya-te-cuesta', 'caso-real', 'pricing', 'tabs-locales', 'hero-bodas']
t['catalog'] = [cat[k] for k in order if k in cat] + [m for k, m in cat.items() if k not in order]

# ---------------------------------------------------------------- textos de los ángulos (sección 2)
def cards(*pairs):
    return [{'problem': a, 'solution': b} for a, b in pairs]

ANGULOS = {
    'a': {
        'label': 'A · Líder', 'portada': 'Lo próximo que van a copiarte',
        'hint': 'El local de referencia de su zona: su miedo es que le alcancen. Precio: tarifa limpia, sin descuentos. Nunca: que se parece a otro, que el sector está en caída ni que necesita diferenciarse.',
        'cards': cards(
            ('Lo que montas hoy, en seis meses lo tienen todos.', 'Vuelves a ser el primero en tener algo que nadie tiene.'),
            ('Tus pantallas enseñan lo mismo que las de cualquiera.', 'Tus pantallas pasan a ser el sitio donde todo el mundo quiere salir.'),
            ('El contenido que se mueve de tu local no lo controlas tú.', 'Cientos de fotos al mes, de tu gente, con permiso para publicarlas.')),
    },
    'b': {
        'label': 'B · Noches flojas', 'portada': 'Que un martes en {company} pase algo',
        'hint': 'Caja justa, entre semana muerto, temporada baja larga. Nunca nombres «dificultad económica». Precio: validación si queda cupo, y los dos primeros meses sin permanencia. Nunca prometas que se quedan más ni que consumen más.',
        'cards': cards(
            ('Hay horas en las que la barra está parada y no puedes hacer nada.', 'Mandas a tu pantalla «chupito a 2 € los próximos diez minutos», desde el móvil.'),
            ('Entre semana la sala está muerta y la gente se va pronto.', 'Con quince personas, las peticiones entre ellos y los mensajes en pantalla les dan algo que hacer.'),
            ('Montar algo especial te cuesta dinero cada vez.', 'Esto funciona todas las noches sin que tengas que montar nada.')),
        'note': 'Las fotos lucen con la sala llena; las canciones funcionan igual con la sala vacía.',
    },
    'c': {
        'label': 'C · Que vuelvan', 'portada': 'Que el que viene un sábado vuelva al siguiente',
        'hint': 'Rotación alta, poca clientela fija. Precio: suscripción mensual, nunca noche suelta. Nunca: CRM, remarketing ni base de datos de clientes (es roadmap).',
        'cards': cards(
            ('Entra gente nueva cada finde y no vuelve ninguna.', 'Se van con su foto en tu álbum y con algo que contar.'),
            ('No sabes quién viene ni qué le gusta.', 'Ves qué piden, a qué hora y cuánta gente participa cada noche.'),
            ('Cuidas a los de siempre a ojo.', 'Puedes montarles algo en pantalla cuando los veas entrar.')),
    },
    'd': {
        'label': 'D · Marca y contenido', 'portada': 'El contenido de tus noches, hecho por tu gente',
        'hint': 'El que cuida su Instagram, trabaja con promotoras o tiene alguien de marketing. Y el dueño de oficina. Si dudas, este: es el único que no presupone nada sobre cómo le va al local.',
        'cards': cards(
            ('Las fotos para Instagram las acabas haciendo tú el domingo.', 'Cientos de fotos cada noche, subidas por tu propia gente.'),
            ('Pagas a alguien cuando quieres contenido decente.', 'Sin fotógrafo y sin pedir permiso: lo aceptan al subirlas.'),
            ('Las promotoras eligen otros locales para sus fiestas.', 'Tienes algo que ofrecerle a una promotora que el local de al lado no tiene.')),
    },
    'e': {
        'label': 'E · Público que no conoces', 'portada': 'Que te digan ellos qué quieren oír',
        'hint': 'Costa con extranjeros, fiestas Erasmus, temáticas de país. Se vende como «ves qué canciones te piden y cuáles no tienes»; nunca como perfil demográfico (eso es roadmap).',
        'cards': cards(
            ('Montas una temática de un país y pones el top 10 de allí, a ciegas.', 'Te piden ellos lo que quieren, y la próxima vez ya lo tienes.'),
            ('Tu público cambia cada semana y no sabes qué pinchar.', 'Ves qué te pidieron y qué no pudiste poner.'),
            ('El DJ va a ojo con gente que no conoce.', 'Lee la sala con lo que la propia sala está pidiendo.')),
        'note': 'Si el primer día te piden cinco canciones que no tienes, el segundo ya las tienes.',
    },
    'f': {
        'label': 'F · Público adulto que paga', 'portada': 'Tu gente paga por salir en tu pantalla',
        'hint': 'Público de 30 a 45: participa menos y paga más. Objeción «mi gente no usa el móvil»: lo manda uno por mesa. Enseña que alguien de la casa valida.',
        'cards': cards(
            ('Tienes público que gasta y no le ofreces nada distinto.', 'Lo que mandan no es cachondeo: es «te quiero, Trini» o «¿te quieres casar conmigo?». Por eso pagan.'),
            ('Las promociones que pones no las ve nadie.', 'Este público sí compra lo que sale en pantalla.'),
            ('Sale una vez al mes y no sabes si volverá.', 'Si se lo pasó bien, vuelve. Son los más leales que tienes.')),
    },
}
D_AUTORIZADO = cards(
    ANGULOS['d']['cards'][0].values(), ANGULOS['d']['cards'][1].values(),
    ('Las promotoras eligen otros locales para sus fiestas.', 'A un pub de Málaga una promotora lo eligió por poder ofrecer estas dinámicas.'))
NOCHES_FLOJAS = ('Con quince personas en el local, las peticiones entre ellos y los mensajes en pantalla les dan algo que hacer. '
                 'Las fotos lucen con la sala llena; las canciones funcionan igual con la sala vacía.')

# ---------------------------------------------------------------- pantalla (03), gente (04), sala (05)
scenes = {s['scene']: s for s in cat['pantalla-en-vivo']['props']['scenes']}
PROMO = {'scene': 'club.promo', 'label': 'Tu mensaje', 'text': 'Chupito a 2 € los próximos diez minutos',
         'says': 'Un martes a la una y media ves la barra parada y mandas «chupito a 2 € los próximos diez minutos». Desde tu móvil, sin tocar el ordenador.'}
PROMO_A = {**PROMO, 'says': 'Lanzas lo que quieras a tu pantalla desde el móvil, en el momento.'}
SCENES = [PROMO, scenes['club.photo'], scenes['club.message'], scenes['club.idle'], scenes['club.song']]
# F: la dedicatoria sube a primera escena; el álbum y la foto, secundarios.
SCENES_F = [scenes['club.message'], PROMO, scenes['club.photo'], scenes['club.idle'], scenes['club.song']]
VJ = scenes['tp.idle']

PASO_QR = {'key': 'scan', 'says': 'Apunta con la cámara al QR. Sin descargar nada y sin registrarse.', 'owner': 'Entra todo el mundo, también el que no se baja apps.'}
PASO_ELIGE = {'key': 'sheet', 'says': 'Elige: foto en pantalla, mensaje, o subir al álbum.', 'owner': 'Tres motivos distintos para sacar el móvil en tu local.'}
PASO_MANDA = {'key': 'form', 'label': 'Su dedicatoria', 'says': 'Escribe su dedicatoria y la manda.', 'owner': 'Tu encargado la aprueba desde su móvil en un segundo.'}
GENTE = [{'title': 'Lo que va a hacer tu gente', 'steps': [PASO_QR, PASO_ELIGE, PASO_MANDA]}]
SALA = [{'title': 'Y lo que pasa en tu sala', 'steps': [
    {'key': 'live', 'says': 'Su foto sale en grande delante de todos.', 'owner': 'Media sala mirando la pantalla a ver quién sale.'},
    {'key': 'album', 'says': 'Se queda en el álbum de la noche y todos lo ven.', 'owner': 'Esas fotos las tienes tú al día siguiente, listas para publicar.'},
    {'key': 'form', 'label': 'Con permiso', 'says': 'Al subirla acepta los términos de uso.', 'owner': 'Son fotos que puedes publicar. De tu gente, de tu local, cada noche que abras.'},
]}]
# Sin pantalla: el QR en la barra y en las mesas (Batiq), y la foto se queda en el álbum (no «sale en grande»).
GENTE_SIN = [{'title': 'Lo que va a hacer tu gente', 'steps': [
    {**PASO_QR, 'owner': 'El QR va en la barra y en las mesas. Batiq lo montó así, sin pantalla, y funcionó igual.'}, PASO_ELIGE, PASO_MANDA]}]
SALA_SIN = [{'title': 'Y lo que pasa en tu sala', 'steps': [
    {'key': 'album', 'says': 'Se queda en el álbum de la noche y todos lo ven.', 'owner': 'Las fotos se te quedan en el álbum de la noche, con permiso para publicarlas.'},
    {'key': 'form', 'label': 'Con permiso', 'says': 'Al subirla acepta los términos de uso.', 'owner': 'Son fotos que puedes publicar. De tu gente, de tu local, cada noche que abras.'},
]}]
MOVIL = {'lede': '', 'djName': '', 'price': 0}

MESAS_TAB = {'label': 'Por mesa', 'title': 'Las mesas se hablan por la pantalla',
             'body': 'Pon un número en cada mesa y deja que se escriban por la pantalla.', 'bullets': ['«Los de la mesa 1 son muy guapos»'],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/messages-screen.webp', 'alt': 'Mensajes entre mesas en la pantalla'}}

proposal = {
    'blocks': {
        'portada': {'module': 'portada', 'props': {'eyebrow': 'Propuesta para {company}', 'title': ANGULOS['d']['portada'],
                                                    'subtitle': 'Tu público participa desde el móvil, sale en tus pantallas, y tú te quedas con el contenido.'}},
        'problema': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que te pasa hoy', 'cards': ANGULOS['d']['cards']}},
        'grupo': {'module': 'lo-que-te-pasa', 'props': {'eyebrow': 'Varios locales', 'title': 'Cada sala, comparada con las otras', 'cards': cards(
            ('Cada local va por su cuenta y no sabes comparar.',
             'Lo pones en los cinco y al mes ves cuál se mueve y cuál no. No por lo que te cuente cada encargado, sino por lo que pide la gente en cada sala.')),
            'note': 'Para grupos, 25 % sobre el total. Todos los locales, no uno de prueba.'}},
        'privados': {'module': 'lo-que-te-pasa', 'props': {'eyebrow': 'Despedidas, cumpleaños, cenas de empresa', 'title': 'Para tus privados', 'cards': cards(
            ('Un privado tiene tiempos muertos y gente que no se conoce.', 'Dedicatorias y fotos en pantalla resuelven exactamente eso.')),
            'note': 'Cuando te pidan presupuesto para una despedida, lo metes como extra. Te cuesta lo mismo que una noche normal y lo revendes dentro del paquete.'}},
        'pantalla': {'module': 'pantalla-en-vivo', 'props': {'eyebrow': 'Para ti', 'title': 'Tu pantalla, desde tu móvil', 'lede': '', 'djName': '', 'scenes': SCENES}},
        'gente': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Tu gente', 'title': 'Lo que va a hacer tu gente', 'parts': GENTE}},
        'sala': {'module': 'movil-invitado', 'props': {**MOVIL, 'eyebrow': 'Tu sala', 'title': 'Y lo que pasa en tu sala', 'parts': SALA}},
        'dj': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Tu DJ', 'title': 'Tu DJ no tiene que ocuparse de nada', 'tabs': [
            {'label': 'Tu DJ', 'title': 'Quién aprueba lo decides tú', 'body': 'El encargado, el de la puerta.',
             'bullets': ['Menú cerrado: nadie te rompe el ambiente', 'Lo que paga el público va a tu cuenta, y casi todos lo reparten como propina del equipo'],
             'mock': {'kind': 'image', 'src': 'asset:img/live/request-mobile-2.webp', 'alt': 'Petición de canción desde el móvil'}}]}},
        'mesas': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Dinámicas', 'title': 'Lo que montan otros locales con esto', 'tabs': [
            MESAS_TAB,
            {'label': 'Chupito por fotos', 'title': 'Chupito por fotos', 'body': 'Con el contador que valida el camarero en dos segundos.', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-mobile.webp', 'alt': 'Álbum de la noche en el móvil'}},
            {'label': 'Sorteo', 'title': 'Sorteo por participación',
             'body': 'Verificable: la app enseña al staff cuántas fotos ha subido esa persona, con hora y segundos.', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-grid.webp', 'alt': 'Fotos subidas por el público'}}]}},
        'cuesta': {'module': 'lo-que-ya-te-cuesta', 'props': {}},
        'caso-anon': {'module': 'caso-real', 'props': {}},
        'caso-nombre': {'module': 'caso-real', 'props': {'eyebrow': 'Un caso real', 'client': 'La Biblioteca', 'place': 'pub de Málaga · unas 300 personas', 'body': CASO_NOMBRE}},
        'precio': {'module': 'pricing', 'props': {
            'eyebrow': 'Cómo empezamos', 'title': 'Propuesta para {company}',
            'subtitle': 'Lo dejamos configurado contigo en una videollamada de 20 minutos. Tu equipo no tiene que hacer nada.',
            'features': ['Configuración guiada en 20 minutos', 'Personalización con tu marca', 'Analítica de participación de cada noche'],
            'smallPrint': 'Suscripción con permanencia de 6 meses. Noches sueltas, pago único.',
            'footnote': 'Tú decides si las peticiones son gratis o de pago. Ese dinero se queda en tu local.'}},
    },
    'modes': {
        'full': ['portada', 'problema', 'pantalla', 'gente', 'sala', 'caso-anon', 'precio'],
        'visual': ['pantalla', 'gente', 'sala', 'precio'],
    },
    'max': {'full': 8, 'visual': 5},
    # Si no caben: portada, problema, pantalla, tu gente, tu sala, precio; luego el primer condicional (DJ → mesas →
    # lo que ya te cuesta) y el caso el último. Lo que no cabe se queda fuera.
    'priority': ['portada', 'problema', 'privados', 'pantalla', 'gente', 'sala', 'precio', 'grupo', 'dj', 'mesas', 'cuesta', 'caso-anon', 'caso-nombre'],
    'choices': [
        {'key': 'tipo', 'label': '¿Qué tipo de cliente es?', 'default': 'estandar',
         'hint': 'Karaoke: pendiente de confirmar el aviso de turno y la cola con nombres. Caseta, charanga sin pantalla y chiringuito sin pantalla no llevan propuesta.',
         'options': [
             {'key': 'estandar', 'label': 'Local', 'hint': 'Pub, discoteca o sala que abre varias noches.'},
             {'key': 'grupo', 'label': 'Grupo con varios locales',
              'hint': 'Le vendes poder comparar entre sus salas. Reunión con el dueño y los gerentes: nunca se la mandes al gerente para que se la pase. Nunca un piloto en un local. Cupón de grupo (−25 %), todos los locales.',
              'rules': [{'add': 'grupo', 'after': 'problema', 'before': 'precio'}]},
             {'key': 'privados', 'label': 'Revende para privados',
              'hint': 'No te compra para sus noches: te compra para revenderlo en despedidas, cumpleaños y cenas. Si el margen no es relevante frente a lo que factura por el privado, no lo vende.',
              'rules': [{'replace': 'problema', 'with': 'privados'}, {'patch': 'portada', 'set': {'title': '{company}'}}]},
         ]},
        {'key': 'angulo', 'label': '¿Qué le mueve a este cliente? (pregunta 4)', 'default': 'd', 'when': ['tipo:estandar', 'tipo:grupo'],
         'hint': 'Uno solo, nunca mezclados.',
         'options': [
             {'key': k, 'label': a['label'], 'hint': a['hint'], 'rules': [
                 {'patch': 'portada', 'set': {'title': a['portada']}},
                 {'patch': 'problema', 'set': {'cards': a['cards'], **({'note': a['note']} if a.get('note') else {})}},
             ] + ([{'patch': 'pantalla', 'set': {'scenes': [PROMO_A, *SCENES[1:]]}},
                   {'patch': 'caso-anon', 'set': {'body': 'A un pub de Málaga de 300 personas, bastante más pequeño que vosotros, una promotora los eligió por poder ofrecer esto.'}},
                   {'patch': 'caso-nombre', 'set': {'body': 'A La Biblioteca, un pub de Málaga de 300 personas, bastante más pequeño que vosotros, una promotora los eligió por poder ofrecer esto.'}}]
                  if k == 'a' else [{'patch': 'pantalla', 'set': {'scenes': SCENES_F}}] if k == 'f' else [])}
             for k, a in ANGULOS.items()
         ]},
    ],
    'questions': [
        {'key': 'oficina', 'label': '¿Decide un dueño que no pisa la sala?', 'when': ['tipo:estandar', 'tipo:grupo'],
         'hint': 'Las tarjetas pasan a las de marca y contenido. Fuera el argumento de ambiente. Reunión con los dos.',
         'rules': [{'patch': 'problema', 'set': {'cards': ANGULOS['d']['cards']}}]},
        {'key': 'autorizado', 'label': '¿La Biblioteca ha autorizado por escrito salir con su nombre?',
         'hint': 'Sin autorización escrita, el caso sale anónimo: funciona casi igual.',
         'rules': [{'replace': 'caso-anon', 'with': 'caso-nombre'},
                   {'patch': 'problema', 'set': {'cards': D_AUTORIZADO}, 'when': 'angulo:d'},
                   {'patch': 'problema', 'set': {'cards': D_AUTORIZADO}, 'when': 'oficina'}]},
        {'key': 'sin-pantalla', 'label': '¿No tiene pantalla?', 'hint': 'Fuera la pantalla. Un chiringuito sin pantalla no se vende.',
         'rules': [{'remove': 'pantalla'}, {'patch': 'gente', 'set': {'parts': GENTE_SIN}}, {'patch': 'sala', 'set': {'parts': SALA_SIN}},
                   {'patch': 'portada', 'set': {'subtitle': 'Tu público participa desde el móvil, y tú te quedas con el contenido.'}}]},
        {'key': 'vj', 'label': '¿Ya tiene visuales o VJ?', 'hint': 'Segunda escena: nos ponemos encima sin tocarlos.',
         'rules': [{'insert': 'pantalla', 'into': 'scenes', 'at': 1, 'value': VJ}]},
        {'key': 'dj', 'label': '¿Tiene DJ residente?', 'rules': [{'add': 'dj', 'after': 'sala', 'before': 'precio'}]},
        {'key': 'mesas', 'label': '¿Es un pub con la gente sentada en mesas?', 'rules': [{'add': 'mesas', 'after': ['dj', 'sala'], 'before': 'precio'}]},
        {'key': 'flojas', 'label': '¿Te ha hablado de noches flojas?', 'when': ['angulo:a', 'angulo:c', 'angulo:d', 'angulo:e', 'angulo:f'],
         'hint': 'Se añade a «Lo que te pasa hoy». Sin prometer consumo.',
         'rules': [{'patch': 'problema', 'set': {'note': NOCHES_FLOJAS}}]},
        {'key': 'cifras', 'label': '¿Te ha dado cifras de lo que ya le cuesta el contenido? (pregunta 3)',
         'hint': 'Luego mete sus cifras en «Lo que ya te cuesta». Sin cifras, no sale.',
         'rules': [{'add': 'cuesta', 'after': ['mesas', 'dj', 'sala'], 'before': 'precio'}]},
    ],
}

for sg in t['market']:
    if sg['key'] == 'ocio-nocturno':
        sg['proposal'] = proposal

# ---------------------------------------------------------------- el DJ colaborador (sección 5)
plays = {p['key']: p for p in t['playbook']}
for k in ('noche-bajas', 'gen-suelos', 'estrategia-bandera', 'estrategia-datos'):
    if k in plays:
        plays[k]['audience'] = 'team'  # lo que el colaborador nunca puede ver
if 'dj-colaborador' not in plays:
    t['playbook'].append({
        'key': 'dj-colaborador', 'module_key': None, 'kind': 'pitch', 'stage': 'primer_contacto', 'objection': None, 'segments': ['ocio-nocturno'],
        'personas': [], 'audience': 'team', 'about': False, 'pinned': None,
        'title': 'Para el DJ colaborador (PENDIENTE antes de dárselo)',
        'body': ('No es un cliente: es un canal. Lo que necesita, y nada más: qué es Enjoy en treinta segundos, la demo para enseñarla en el '
                 'móvil, qué se lleva él, y a quién tiene que preguntarle en su local.\n\n> «Tú lo enseñas en tu local y nosotros cerramos. Si entra, '
                 'cobras durante el primer año. No tienes que saber precios ni negociar nada: nos pasas el contacto del dueño y lo llevamos nosotros.»\n\n'
                 '**Sin precios.** Un DJ que negocia mal te quema el local.\n\n**PENDIENTE de cerrar por escrito antes de dárselo:** si cobra por traer el '
                 'local o solo si se cierra, y qué pasa cuando deja de pinchar allí. Hasta entonces, solo la ve el equipo interno.'),
        'when_to_use': None, 'why_it_works': None, 'technique_refs': [], 'status': 'official',
    })

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('locales:', len(proposal['blocks']), 'bloques ·', len(proposal['choices']), 'elecciones ·', len(proposal['questions']), 'preguntas')
