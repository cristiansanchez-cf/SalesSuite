#!/usr/bin/env python3
"""
Aplica a tenants/oquea/tenant.json la guía de inicio (docs/ventas/oquea/fuentes/03-guia-de-inicio-PT.pdf, traducida en
03-guia-de-inicio-ES.md) y la web de Oquea (fuentes/ui-web/index.astro, copy literal en español). Va después de
apply-oquea-00.py. Idempotente: rehace el catálogo, el sector, el recorrido y las jugadas que carga (por clave).

- Pie: teléfono, WhatsApp y web de la guía (Cristian, 4 y 5-oct-2026: «todo de la guía»; el WhatsApp es el de la
  presentación en portugués).
- Consola del centro (plantilla center-console): la pantalla de escritorio que compra un centro.
- Catálogo: diapositivas «Pasos con la app» (plantilla app-steps) con las pantallas de la app recreadas en español
  (las capturas de la guía están casi todas en inglés; solo se usa tal cual una que está en español).
- Sector «Centros de buceo» con su receta (portada → cómo funciona → … → cierre). Sin precio: falta el documento 04.
- Recorrido de Aprende («Lo que vendes, en 1 minuto») con capturas reales.
- Jugadas: solo lo que dicen la guía y la web. Lo traducido va marcado en «Fuente».

    python3 scripts/apply-oquea-03.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())

# ---------------------------------------------------------------- 0. pie
t['brand']['contact'] = {
    'whatsapp': '34623790890',
    'phone': '+34 623 790 890',
    'email': 'enrique@oquea.com',
    'website': 'https://oquea.app',
}

APP = 'asset:img/producto/app/'
WEB = 'asset:img/producto/web/'
PHOTO = 'asset:img/fotos/share-card-bg.webp'


def steps(key, name, description, **props):
    props.setdefault('photo', PHOTO)
    return {'key': key, 'block_type': 'app-steps', 'name': name, 'is_catalog': True, 'default_price': None,
            'currency': 'EUR', 'description': description, 'props': props}


def img(name, alt):
    return {'screen': 'image', 'src': APP + name, 'alt': alt}


# ---------------------------------------------------------------- 1. catálogo
CATALOG = [
    steps('portada', 'Portada', 'La primera diapositiva: para quién es y la promesa de la guía («en minutos»).',
          tone='dark', eyebrow='Para {company}', title='Empieza a usar Oquea en minutos.', highlight='Oquea',
          lede='Paso a paso, desde el registro hasta tener tu centro activo, tu QR listo y tus buceadores conectados.',
          screens=[{'screen': 'access'}]),
    steps('como-funciona', 'Cómo funciona: escanean, tú los ves',
          'El argumento en tres pasos (guía, diapositiva 13): escanean tu QR, los ves en tu CRM y comparten con tu logo.',
          title='Tus buceadores escanean, tú los ves', highlight='buceadores',
          lede='Cuando un buceador escanea tu QR, queda conectado a tu centro. Tú lo ves en tu CRM y él puede compartir su inmersión.',
          cards=[
              {'icon': 'qr', 'title': 'El buceador escanea el QR', 'body': 'Entra en la actividad del día y registra su inmersión al momento.'},
              {'icon': 'users', 'title': 'Tú lo ves en tu CRM', 'body': 'Historial, inmersiones, certificaciones y datos de cada buceador.'},
              {'icon': 'share', 'title': 'Ellos comparten la inmersión', 'body': 'Con tu logo. Marketing orgánico para tu centro.'},
          ],
          screens=[{'screen': 'dive-saved'}, {'screen': 'share-card'}]),
    {'key': 'consola', 'block_type': 'center-console', 'name': 'Consola del centro', 'is_catalog': True, 'default_price': None,
     'currency': 'EUR', 'description': 'La consola de escritorio: lo de hoy, quién viene, el CRM y tu centro. Interactiva.',
     'props': {
         'eyebrow': 'Desde el ordenador del centro', 'title': 'Todo tu centro, en una pantalla', 'highlight': 'en una pantalla',
         'lede': 'Lo que hace el día a día: tus salidas, quién viene a cada una y tu lista de buceadores.',
         'views': [
             {'view': 'today', 'label': 'Hoy', 'says': 'Las salidas del día y cuántos buceadores tienes ya en tu CRM.'},
             {'view': 'activity', 'label': 'Quién viene', 'says': 'En cada salida ves quién escaneó el QR y a quién añadiste a mano.'},
             {'view': 'crm', 'label': 'CRM', 'says': 'Cada buceador, con su historial en tu centro y tus notas internas.'},
             {'view': 'centre', 'label': 'Tu centro', 'says': 'Tu QR, tu perfil público y cómo te ven los buceadores.'},
         ],
     }},
    steps('registro-qr', 'Registro de inmersiones por QR',
          'Lo que vive el buceador: escanea, ve la actividad del día y la guarda en su logbook. Sin instalar nada.',
          title='Un escaneo y la inmersión queda en su logbook', highlight='un escaneo',
          lede='Llega al centro, escanea el QR del día y la inmersión queda guardada en su perfil.',
          cards=[
              {'icon': 'phone', 'title': 'Sin descargar nada', 'body': 'Se abre en el navegador del móvil: oquea.app.'},
              {'icon': 'clock', 'title': 'Al final del día', 'body': 'Cada inmersión se guarda en el logbook con un solo escaneo.'},
              {'icon': 'building', 'title': 'Con tu centro dentro', 'body': 'Al guardar, tu centro añade la inmersión a su historial.'},
          ],
          screens=[{'screen': 'qr-activity'}, {'screen': 'dive-saved'}]),
    steps('crm', 'CRM del centro', 'Cada buceador que escanea entra en el CRM del centro, con su historial y sus datos.',
          title='Cada buceador, en tu CRM', highlight='tu CRM',
          lede='Quien escanea tu QR queda conectado a tu centro. Ves quién vino, cuántas veces y qué ha buceado contigo.',
          cards=[
              {'icon': 'users', 'title': 'Historial con tu centro', 'body': 'Inmersiones, primera y última visita, cursos.'},
              {'icon': 'shield', 'title': 'Certificaciones y datos', 'body': 'Historial, inmersiones, certificaciones y datos de cada buceador.'},
              {'icon': 'qr', 'title': 'Escaneó el QR o lo añadiste tú', 'body': 'Ves cómo llegó cada uno a tu lista.'},
          ],
          screens=[{'screen': 'crm-list'}, {'screen': 'crm-diver'}]),
    steps('compartir', 'Compartir la inmersión', 'La tarjeta para redes con los datos de la inmersión y el logo del centro.',
          title='Comparten la inmersión, con tu logo', highlight='con tu logo',
          lede='Datos de profundidad, tiempo y temperatura sobre su mejor foto: listo para Stories.',
          cards=[
              {'icon': 'megaphone', 'title': 'Marketing orgánico para tu centro', 'body': 'Cada tarjeta que se comparte lleva tu nombre y tu logo.'},
              {'icon': 'image', 'title': 'Fotos y vídeos de la salida', 'body': 'Desde la actividad, el buceador ve las fotos y vídeos.'},
          ],
          screens=[{'screen': 'share-card'}]),
    steps('qr-del-centro', 'Tu QR', 'El QR único del centro: dónde ponerlo y para qué sirve.',
          title='Descarga tu QR y ponlo en tu centro', highlight='QR',
          lede='Cada centro tiene un QR único. Imprímelo y ponlo en el barco, en la entrada o en el mostrador. Los buceadores lo escanean, registran la actividad y se quedan conectados contigo.',
          cards=[
              {'icon': 'qr', 'title': 'Descarga el QR', 'body': 'En el panel de tu centro, descárgalo en alta resolución para imprimirlo.'},
              {'icon': 'anchor', 'title': 'Ponlo donde más se use', 'body': 'Barco, mostrador, entrada. Cuanto más visible, más escaneos.'},
          ],
          screens=[{'screen': 'center-qr'}]),
    steps('actividades', 'Actividades', 'Crear actividades ligadas a un dive site, y programarlas una vez para todos los días.',
          title='Crea tus actividades en menos de un minuto', highlight='menos de un minuto',
          lede='Cada actividad está ligada a un punto de inmersión. Puedes programarlas con antelación para crearlas una sola vez.',
          cards=[
              {'icon': 'calendar', 'title': 'Crea una actividad', 'body': 'Nombre, dive site, fecha y hora. Listo en menos de un minuto.'},
              {'icon': 'repeat', 'title': 'Prográmalas', 'body': 'Define actividades recurrentes (salidas diarias) y no tendrás que crearlas cada vez.'},
          ],
          tip={'kind': 'bulb', 'text': 'Después de crear la actividad, tus buceadores podrán unirse escaneando tu código QR.', 'strong': '¡Listo!'},
          screens=[{'screen': 'activities'}, {'screen': 'create-activity'}]),
    steps('dive-sites', 'Dive sites', 'Los puntos de inmersión del centro. Si lo prefiere, Oquea se los da de alta.',
          title='Crea tus puntos de inmersión', highlight='puntos de inmersión',
          lede='Los dive sites son los lugares donde buceas. Los necesitas en Oquea para asociarlos a las actividades.',
          cards=[
              {'icon': 'pin', 'title': 'Ve a «Dive sites»', 'body': 'En el panel de tu centro, pulsa Añadir dive site.'},
              {'icon': 'headset', 'title': '¿Prefieres que lo hagamos por ti?', 'body': 'Escríbenos y los creamos nosotros. Solo dinos los nombres y las coordenadas.'},
          ],
          tip={'kind': 'check', 'text': 'Complétalos con profundidad, entorno, vida marina… Los demás podrán verlos en su logbook.', 'strong': '¡Compártelos con todos!'},
          screens=[{'screen': 'dive-sites'}]),
    steps('equipo', 'Equipo del centro', 'Instructores y divemasters dentro del centro, invitados con un enlace.',
          title='Añade a tu equipo al centro', highlight='equipo',
          lede='¿Trabajas con instructores o divemasters? Invítalos al centro para que puedan crear y gestionar actividades contigo.',
          cards=[
              {'icon': 'link', 'title': 'Envíales el enlace', 'body': 'Pídeles que se unan. Una vez dentro, podréis colaborar en tiempo real.'},
              {'icon': 'share', 'title': 'Copia el enlace', 'body': 'Panel → Equipo → copia el enlace de invitación y compártelo por WhatsApp o email.'},
          ],
          screens=[{'screen': 'team'}]),
    steps('alta-centro', 'Alta del centro', 'Cómo queda el centro en Oquea: datos, unidades, logo y fotos, y verificación en menos de 24 h.',
          title='Tu centro en Oquea, verificado en menos de 24 h', highlight='en menos de 24 h',
          lede='Rellenas los datos una vez y los puedes editar cuando quieras. Cuanto más completo, más fácil será que los buceadores te encuentren.',
          cards=[
              {'icon': 'building', 'title': 'Datos básicos', 'body': 'Nombre, ubicación y contacto del centro.'},
              {'icon': 'ruler', 'title': 'Tus unidades', 'body': 'Metros o pies, temperatura, presión, duración habitual y presión de llenado.'},
              {'icon': 'image', 'title': 'Logo, redes y fotos', 'body': 'Instalaciones, barco, equipo… La mejor cara de tu centro.'},
              {'icon': 'send', 'title': 'Envías la solicitud', 'body': 'Nuestro equipo verifica tu centro en menos de 24 h y te avisa cuando está listo.'},
          ],
          screens=[img('20-registro-centro-unidades-es.png', 'Registro del centro: unidades y valores por defecto'), {'screen': 'my-centres'}]),
    steps('cierre', 'Cierre', 'La última diapositiva: estamos aquí, con el contacto directo.',
          tone='dark', eyebrow='¡Todo listo!', title='¿Alguna duda? Estamos aquí.', mark='asset:isotipo-blanco.svg',
          lede='Cualquier pregunta, problema técnico o si prefieres que te ayudemos a configurar el centro o a añadir inmersiones, escríbenos. Lo resolvemos juntos.',
          pills=[
              {'icon': 'mail', 'label': 'enrique@oquea.com', 'href': 'mailto:enrique@oquea.com'},
              {'icon': 'globe', 'label': 'www.oquea.app', 'href': 'https://oquea.app'},
              {'icon': 'phone', 'label': '+34 623 790 890', 'href': 'tel:+34623790890'},
          ]),
]
t['catalog'] = CATALOG

# ---------------------------------------------------------------- 2. sector y receta
B = {k: {'module': k, 'props': {}} for k in [m['key'] for m in CATALOG]}
SEGMENT = {
    'key': 'centros-buceo',
    'name': 'Centros de buceo',
    'icon': 'anchor',
    'image': PHOTO,
    'description': 'Centros que organizan salidas, cursos e inmersiones, con su barco, su mostrador y su equipo.',
    'value_prop': ('Tus buceadores escanean tu QR y quedan conectados a tu centro: los ves en tu CRM y, cuando comparten la '
                   'inmersión, sale tu logo. Marketing orgánico para tu centro.'),
    'icp': None, 'disqualifiers': None, 'buying_process': None, 'deal_size': None, 'sales_cycle': None,
    'notice': ('Contenido de partida, sacado de la guía de inicio y de la web. Faltan cliente ideal, actores, precios y casos '
               '(documentos 01–07 del negocio). No hables de precio hasta que esté la tarifa.'),
    'modules': [
        {'module_key': 'como-funciona', 'priority': 1, 'fit': 'El argumento entero en una diapositiva.'},
        {'module_key': 'consola', 'priority': 1, 'fit': 'Lo que compra un centro: su día a día en el ordenador.'},
        {'module_key': 'crm', 'priority': 1, 'fit': 'Lo que gana quien paga: sus buceadores, por fin en una lista.'},
        {'module_key': 'compartir', 'priority': 1, 'fit': 'Marketing orgánico: cada tarjeta lleva su logo.'},
        {'module_key': 'registro-qr', 'priority': 2, 'fit': 'Para enseñar lo fácil que es para el buceador.'},
        {'module_key': 'qr-del-centro', 'priority': 2, 'fit': 'Lo único que tiene que hacer el centro: poner el QR.'},
        {'module_key': 'actividades', 'priority': 2, 'fit': 'Para centros con salidas diarias.'},
        {'module_key': 'alta-centro', 'priority': 3, 'fit': 'Para quitar el miedo a «otra herramienta».'},
        {'module_key': 'equipo', 'priority': 3, 'fit': 'Centros con instructores y divemasters.'},
        {'module_key': 'dive-sites', 'priority': 3, 'fit': 'Si pregunta por el trabajo de montarlo.'},
    ],
    'personas': [],
    'proposal': {
        'blocks': B,
        'modes': {
            'full': ['portada', 'como-funciona', 'consola', 'registro-qr', 'crm', 'compartir', 'qr-del-centro', 'alta-centro', 'cierre'],
            'visual': ['portada', 'como-funciona', 'consola', 'compartir', 'cierre'],
        },
        'max': {'full': 10, 'visual': 6},
        'priority': ['portada', 'cierre', 'como-funciona', 'consola', 'crm', 'compartir', 'registro-qr', 'qr-del-centro', 'alta-centro', 'actividades', 'equipo', 'dive-sites'],
        'questions': [
            {'key': 'salidas-diarias', 'label': '¿Hace salidas todos los días?', 'hint': 'Las actividades se programan una vez.',
             'rules': [{'add': 'actividades', 'after': ['qr-del-centro', 'compartir']}]},
            {'key': 'equipo', 'label': '¿Trabaja con instructores o divemasters?',
             'rules': [{'add': 'equipo', 'before': ['alta-centro', 'cierre']}]},
            {'key': 'montarlo', 'label': '¿Le preocupa el trabajo de montarlo?', 'hint': 'Oquea le da de alta los dive sites.',
             'rules': [{'add': 'dive-sites', 'before': ['alta-centro', 'cierre']}]},
            {'key': 'varios-centros', 'label': '¿Tiene más de un centro?',
             'rules': [{'patch': 'alta-centro', 'set': {'tip': {'kind': 'bulb', 'strong': 'Puedes tener más de un centro.',
                                                               'text': 'Crea uno por cada ubicación física para tenerlo todo ordenado.'}}}]},
        ],
    },
}
t['market'] = [s for s in t.get('market', []) if s['key'] != 'centros-buceo'] + [SEGMENT]

# ---------------------------------------------------------------- 3. recorrido de Aprende
t['tour'] = [
    {'title': 'El centro pone su QR', 'body': 'Uno por centro. En el barco, el mostrador o la entrada.', 'image': APP + '12-qr-del-centro.png'},
    {'title': 'El buceador lo escanea', 'body': 'Desde el navegador del móvil, sin descargar nada. Entra en la actividad del día.', 'image': WEB + '02-registro-qr-logbook.png'},
    {'title': 'Guarda la inmersión en su logbook', 'body': 'Un toque. Su inmersión queda guardada, con tu centro dentro.', 'image': APP + '19-inmersion-guardada.png'},
    {'title': 'El centro lo ve en su CRM', 'body': 'Historial, inmersiones, certificaciones y datos de cada buceador.', 'image': WEB + '04-crm-perfil-buceador.png'},
    {'title': 'Comparte la inmersión, con el logo del centro', 'body': 'Marketing orgánico para el centro.', 'image': 'asset:img/fotos/share-card-aerea.png'},
    {'title': 'El centro organiza sus salidas', 'body': 'Actividades ligadas a un dive site, programadas una vez.', 'image': WEB + '01-panel-centro-actividades.png'},
]

# ---------------------------------------------------------------- 4. jugadas
WEB_SRC = 'Web de Oquea (oquea.com), texto literal.'
GUIA = 'Guía de inicio, traducida del portugués [TRADUCCIÓN].'


def play(key, kind, title, body, stage=None, module=None, about=False, pinned=None, audience='all', when=None, why=None, segments=('centros-buceo',)):
    return {'key': key, 'module_key': module, 'kind': kind, 'stage': stage, 'objection': None, 'segments': list(segments),
            'personas': [], 'audience': audience, 'about': about, 'pinned': pinned, 'title': title, 'body': body,
            'when_to_use': when, 'why_it_works': why, 'technique_refs': [], 'status': 'official'}


PLAYS = [
    play('vision', 'tip', 'La visión',
         'Construimos el ecosistema digital global del buceo. Oquea conecta centros, buceadores y destinos oceánicos en una plataforma unificada que da forma al futuro del buceo.',
         stage='mentalidad', about=True, segments=(), why=WEB_SRC),
    play('oquea-en-una-frase', 'pitch', 'Oquea en una frase',
         'La plataforma digital que conecta centros de buceo, buceadores y destinos.',
         stage='pitch_demo', pinned=1, segments=(), why=WEB_SRC,
         when='Cuando te pregunten «¿y esto qué es?». Después, el argumento en tres pasos.'),
    play('escanean-tu-ves', 'pitch', 'Escanean, tú los ves, comparten con tu logo',
         'Cuando un buceador escanea tu QR, queda conectado a tu centro. Tú lo ves en tu CRM y él puede compartir su inmersión. Con tu logo: marketing orgánico para tu centro.',
         stage='pitch_demo', pinned=2, module='como-funciona',
         when='El centro de la conversación: es lo que gana quien paga (clientes que vuelven y visibilidad gratis).',
         why=GUIA + ' Es la diapositiva con la que se ha validado la venta.'),
    play('fideliza', 'pitch', 'Un negocio que fideliza',
         'Convierte tu centro en un negocio que fideliza. CRM, planificación y comunidad para que cada inmersión se convierta en un cliente que vuelve.',
         stage='pitch_demo', module='crm', why=WEB_SRC),
    play('sin-instalar', 'tip', 'Sin descargar nada',
         'La app se abre en el navegador del móvil: oquea.app. El buceador escanea el QR y entra en la actividad del día, sin instalar nada.',
         stage='pitch_demo', module='registro-qr', when='Si el centro teme que sus buceadores no quieran «otra app».',
         why=GUIA + ' La entrega de la app confirma que el aterrizaje por QR funciona sin cuenta.'),
    play('qr-visible', 'tip', 'Cuanto más visible el QR, más escaneos',
         'Barco, mostrador, entrada. Cuanto más visible, más escaneos.', stage='seguimiento', module='qr-del-centro',
         when='Al cerrar y en el seguimiento de la primera semana: dónde poner el QR.', why=GUIA),
    play('lo-montamos', 'tip', 'Si le da pereza montarlo, se lo montamos',
         '¿Prefieres que lo hagamos por ti? Escríbenos y creamos tus dive sites. Solo dinos los nombres y las coordenadas. También te ayudamos a configurar el centro o a añadir inmersiones.',
         stage='objeciones', module='dive-sites', when='Cuando el centro dice que no tiene tiempo para dar de alta otra herramienta.',
         why=GUIA + ' Servicio que Oquea ofrece en su propia guía.'),
    play('verificacion-24h', 'tip', 'Verificado en menos de 24 h',
         'Envías la solicitud y nuestro equipo verifica tu centro en menos de 24 h. Una vez verificado, tu centro aparece en Oquea.',
         stage='cierre', module='alta-centro', why=GUIA + ' Plazo confirmado por Cristian el 4 de octubre de 2026.'),
    play('en-minutos', 'script', 'Empieza en minutos',
         'Empieza a usar Oquea en minutos: desde el registro hasta tener tu centro activo, tu QR listo y tus buceadores conectados.',
         stage='cierre', module='portada', why=GUIA),
    play('no-se-dice', 'tip', 'Lo que no se vende (todavía)',
         'El mapa interactivo y los viajes y ofertas flash salen en la web como «Próximamente»: no se venden. Las reseñas están apagadas en la app. Tampoco se habla de precio ni de «gratis» hasta que esté la tarifa oficial.',
         stage='mentalidad', audience='team', segments=(), pinned=3,
         why='Web de Oquea («Próximamente») y entrega de la UI de la app (reseñas apagadas a propósito). La tarifa es el documento 04, pendiente.'),
]
keys = {p['key'] for p in PLAYS}
t['playbook'] = [p for p in t.get('playbook', []) if p['key'] not in keys] + PLAYS

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea:', len(t['catalog']), 'módulos ·', len(t['market']), 'sector ·', len(t['tour']), 'pasos de recorrido ·', len(t['playbook']), 'jugadas')
