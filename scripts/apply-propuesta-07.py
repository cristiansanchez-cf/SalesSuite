#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 07 «Cómo debe ser la propuesta»
(docs/ventas/enjoy/fuentes/propuesta-07.md). Idempotente. SUSTITUIDO por apply-propuesta-08.py: no volver a ejecutar.

- Corrige lo que contradice lo ya decidido en todos los sectores: sin kiss-cam, sin «informe post-evento»,
  sin «sin permanencia si lo necesitáis», sin DJ inventado y sin el pago del invitado en el recorrido.
- Añade al catálogo la portada, «lo que te pasa hoy» y el caso real.
- Carga la propuesta de Locales: bloques literales del 07, dos modos (va sola / apoyo visual) y las preguntas.

    python3 scripts/apply-propuesta-07.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
cat = {m['key']: m for m in t['catalog']}

# ---------------------------------------------------------------- correcciones en todos los sectores (07 · 1.4)
exp = cat['tabs-experiencias']
exp['props']['tabs'] = [x for x in exp['props']['tabs'] if x['label'] != 'Kiss-cam']
exp['description'] = 'Dedicatorias y dinámicas: lo que vive cada invitado.'
for m in (cat['tabs-locales'], cat['pricing']):
    def fix(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str):
                    o[k] = v.replace('Informe post-evento', 'Analítica de participación de cada evento')
                else:
                    fix(v)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                if isinstance(v, str):
                    o[i] = v.replace('Informe post-evento', 'Analítica de participación de cada evento')
                else:
                    fix(v)
    fix(m['props'])
cat['pricing']['props']['smallPrint'] = 'Suscripciones con permanencia de 6 meses. Eventos puntuales, pago único.'
cat['pricing']['props'].pop('priceSuffix', None)  # el sufijo sale ya del periodo de la tarifa
# Sin DJ inventado (un local con su residente vería el nombre de otro) y sin el pago del invitado en el recorrido.
cat['movil-invitado']['props']['djName'] = ''
cat['movil-invitado']['props']['price'] = 0
cat['pantalla-en-vivo']['props']['djName'] = ''

# ---------------------------------------------------------------- catálogo nuevo (07 · parte 5)
PORTADA = {
    'key': 'portada', 'block_type': 'hero-pitch', 'name': 'Portada', 'is_catalog': True, 'default_price': None, 'currency': 'EUR',
    'description': 'La primera diapositiva: el nombre del cliente y una línea de qué cambia.',
    'props': {'eyebrow': 'Propuesta para {company}', 'title': '{company}',
              'subtitle': 'Tu público participa desde el móvil, sale en tus pantallas, y tú te quedas con el contenido.',
              'rotatingWords': [], 'ctas': [], 'stats': []},
}
CARDS = [
    {'problem': 'Las fotos para Instagram las acabas haciendo tú el domingo.',
     'solution': 'Cada noche te deja cientos de fotos subidas por tu propia gente, con permiso para usarlas.'},
    {'problem': 'Hay horas en las que la barra está parada y no puedes hacer nada.',
     'solution': 'Mandas un mensaje a la pantalla desde tu móvil: «chupito a 2 € los próximos diez minutos».'},
    {'problem': 'Esta semana haces la misma fiesta que el local de al lado.',
     'solution': 'Algo que pasa en tu sala y que en la de al lado no.'},
]
PROBLEMA = {
    'key': 'lo-que-te-pasa', 'block_type': 'problem-solution', 'name': 'Lo que te pasa hoy', 'is_catalog': True, 'default_price': None, 'currency': 'EUR',
    'description': 'El problema del cliente y lo que cambia, en tarjetas. Contado desde su silla.',
    'props': {'title': 'Lo que te pasa hoy', 'beforeLabel': 'Hoy', 'afterLabel': 'Con Enjoy', 'cards': CARDS},
}
CASO = {
    'key': 'caso-real', 'block_type': 'case-study', 'name': 'Caso real', 'is_catalog': True, 'default_price': None, 'currency': 'EUR',
    'description': 'Un cliente con nombre. Solo con su autorización por escrito para la propuesta.',
    'props': {'eyebrow': 'Lo que le pasó a La Biblioteca', 'title': 'Una promotora los eligió a ellos', 'client': 'La Biblioteca', 'place': 'Málaga',
              'body': 'La Biblioteca es un pub de Málaga. Una promotora de eventos eligió su local para montar una fiesta porque podían ofrecer estas dinámicas y otros no. Una fiesta más es facturación que antes no estaba.'},
}
for m in (PORTADA, PROBLEMA, CASO):
    cat[m['key']] = m
order = ['portada', 'lo-que-te-pasa', 'pantalla-en-vivo', 'movil-invitado', 'tabs-experiencias', 'caso-real', 'pricing', 'tabs-locales', 'hero-bodas']
t['catalog'] = [cat[k] for k in order if k in cat] + [m for k, m in cat.items() if k not in order]

# ---------------------------------------------------------------- propuesta de Locales (07 · parte 4)
NOCHES_FLOJAS = ('Con quince personas en el local, las peticiones entre ellos y los mensajes en pantalla les dan algo que hacer. '
                 'Las fotos lucen con la sala llena; las canciones funcionan igual con la sala vacía.')
PROMO_SAYS = ('Un martes a la una y media ves la barra parada y mandas «chupito a 2 € los próximos diez minutos». '
              'Desde tu móvil, sin tocar el ordenador.')
scenes_base = cat['pantalla-en-vivo']['props']['scenes']
by_scene = {s['scene']: s for s in scenes_base}
PROMO = {'scene': 'club.promo', 'label': 'Tu mensaje', 'says': PROMO_SAYS, 'text': 'Chupito a 2 € los próximos diez minutos'}
# Primero lo que controla él; la canción, la última (nunca la primera ni la segunda con un dueño).
SCENES = [PROMO, by_scene['club.photo'], by_scene['club.message'], by_scene['club.idle'], by_scene['club.song']]
SCENES_VJ = [PROMO, by_scene['tp.idle'], by_scene['tp.photo'], by_scene['club.photo'], by_scene['club.message'], by_scene['club.song']]
PANTALLA = {'eyebrow': 'Para ti', 'title': 'Tu pantalla, desde tu móvil', 'lede': '', 'djName': '', 'scenes': SCENES}

MOVIL_PARTS = [
    {'title': 'Lo que va a hacer tu gente', 'steps': [
        {'key': 'scan', 'says': 'Apunta con la cámara al QR. Sin descargar nada y sin registrarse.',
         'owner': 'Entra todo el mundo, también el que no se baja apps.'},
        {'key': 'sheet', 'says': 'Elige: foto en pantalla, mensaje, o subir al álbum.',
         'owner': 'Tres motivos distintos para sacar el móvil en tu local.'},
        {'key': 'form', 'label': 'Su dedicatoria', 'says': 'Escribe su dedicatoria y la manda.',
         'owner': 'Tu encargado la aprueba desde su móvil en un segundo.'},
    ]},
    {'title': 'Y lo que pasa en tu sala', 'steps': [
        {'key': 'live', 'says': 'Su foto sale en grande delante de todos.',
         'owner': 'Media sala mirando la pantalla a ver quién sale.'},
        {'key': 'album', 'says': 'Se queda en el álbum de la noche, y todos lo ven.',
         'owner': 'Al día siguiente la gente entra en tu Instagram a buscarse.'},
        {'key': 'form', 'label': 'Con permiso', 'says': 'Al subirla acepta los términos de uso.',
         'owner': 'Son fotos que puedes publicar. De tu propia gente, cada noche que abras.'},
    ]},
]
MOVIL = {'eyebrow': 'Tu gente', 'title': 'Lo que va a hacer tu gente', 'lede': '', 'djName': '', 'price': 0, 'parts': MOVIL_PARTS}

MESAS_TAB = {'label': 'Por mesa', 'title': 'Dinámicas por mesa',
             'body': 'Pon un número en cada mesa y deja que se escriban por la pantalla.',
             'bullets': ['«Los de la mesa 1 son muy guapos»'],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/messages-screen.webp', 'alt': 'Mensajes entre mesas en la pantalla'}}
DINAMICAS = {'eyebrow': 'Dinámicas', 'title': 'Dinámicas que ya se hacen con Enjoy', 'tabs': [
    MESAS_TAB,
    {'label': 'Chupito por fotos', 'title': 'Chupito a cambio de subir fotos al álbum', 'body': '', 'bullets': [],
     'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-mobile.webp', 'alt': 'Álbum de la noche en el móvil'}},
    {'label': 'Sorteo', 'title': 'Sorteo por participación',
     'body': 'Verificable: la app enseña al staff cuántas fotos ha subido cada persona, con hora y segundos.', 'bullets': [],
     'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-grid.webp', 'alt': 'Fotos subidas por el público'}},
]}
DJ = {'eyebrow': 'Tu DJ', 'title': 'Tu DJ no tiene que ocuparse de nada', 'tabs': [
    {'label': 'Tu DJ', 'title': 'Lo decides tú',
     'body': 'Quién aprueba lo que sale en pantalla lo decides tú: el encargado, el de la puerta, o va automático. '
             'Y las canciones van con menú cerrado: solo se puede pedir lo que tú metas en la lista.', 'bullets': [],
     'mock': {'kind': 'image', 'src': 'asset:img/live/request-mobile-2.webp', 'alt': 'Petición de canción desde el móvil'}},
]}
PRECIO = {
    'eyebrow': 'Cómo empezamos', 'title': 'Propuesta para {company}',
    'subtitle': 'Lo dejamos configurado contigo en una videollamada de 20 minutos. Tu equipo no tiene que hacer nada.',
    'features': ['Configuración guiada contigo en 20 minutos', 'Personalización con tu marca', 'Analítica de participación de cada noche'],
    'smallPrint': 'Suscripción con permanencia de 6 meses. Noches sueltas, pago único.',
    'footnote': 'Tú decides si las peticiones son gratis o de pago. Ese dinero se queda en tu local.',
}

proposal = {
    'blocks': {
        'portada': {'module': 'portada', 'props': {
            'eyebrow': 'Propuesta para {company}', 'title': 'Que el sábado en {company} no se parezca al de al lado',
            'subtitle': 'Tu público participa desde el móvil, sale en tus pantallas, y tú te quedas con el contenido.'}},
        'problema': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que te pasa hoy', 'cards': CARDS}},
        # Dueño de oficina: contenido sin fotógrafo y diferenciación (el 07 pide también las promotoras: falta su texto literal).
        'problema-oficina': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que te pasa hoy', 'cards': [CARDS[0], CARDS[2]]}},
        'pantalla': {'module': 'pantalla-en-vivo', 'props': PANTALLA},
        'pantalla-visuales': {'module': 'pantalla-en-vivo', 'props': {**PANTALLA, 'scenes': SCENES_VJ}},
        'movil': {'module': 'movil-invitado', 'props': MOVIL},
        'dinamicas': {'module': 'tabs-experiencias', 'props': DINAMICAS},
        'mesas': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Dinámicas', 'title': 'Dinámicas por mesa', 'tabs': [MESAS_TAB]}},
        'dj': {'module': 'tabs-experiencias', 'props': DJ},
        'caso': {'module': 'caso-real', 'props': {}},
        'precio': {'module': 'pricing', 'props': PRECIO},
    },
    'modes': {
        'full': ['portada', 'problema', 'pantalla', 'movil', 'precio'],
        'visual': ['movil', 'pantalla', 'dinamicas', 'precio'],
    },
    'questions': [
        {'key': 'oficina', 'label': '¿Decide un dueño que no pisa la sala?', 'hint': 'Cambia el argumento: facturación y contenido, no ambiente.',
         'rules': [{'replace': 'problema', 'with': 'problema-oficina'}]},
        {'key': 'sin-pantalla', 'label': '¿No tiene pantalla?', 'hint': 'Fuera la pantalla: el móvil y el álbum al centro.',
         'rules': [{'remove': 'pantalla'}, {'remove': 'pantalla-visuales'},
                   {'patch': 'problema', 'set': {'cards': [CARDS[0], CARDS[2]]}}]},
        {'key': 'visuales', 'label': '¿Ya tiene visuales o VJ?', 'hint': 'Se enseña cómo nos ponemos encima sin taparlos.',
         'rules': [{'replace': 'pantalla', 'with': 'pantalla-visuales'}]},
        {'key': 'mesas', 'label': '¿Es un pub con la gente sentada en mesas?', 'hint': 'Dinámicas por mesa en lugar de las generales.',
         'rules': [{'replace': 'dinamicas', 'with': 'mesas'}, {'add': 'mesas', 'before': 'precio'}]},
        {'key': 'dj', 'label': '¿Tiene DJ residente?', 'hint': 'Una diapositiva para que el DJ no sea un problema.',
         'rules': [{'add': 'dj', 'after': 'movil'}]},
        {'key': 'flojas', 'label': '¿Tiene noches flojas?', 'hint': 'Se añade a «Lo que te pasa hoy». Sin prometer consumo.',
         'rules': [{'patch': 'problema', 'set': {'note': NOCHES_FLOJAS}}, {'patch': 'problema-oficina', 'set': {'note': NOCHES_FLOJAS}}]},
        {'key': 'caso', 'label': 'Incluir el caso de La Biblioteca', 'hint': 'Solo con su autorización por escrito para la propuesta.',
         'rules': [{'add': 'caso', 'before': 'precio'}]},
    ],
}

for sg in t['market']:
    if sg['key'] == 'ocio-nocturno':
        sg['proposal'] = proposal
        # Recomendados (botón «Añadir los recomendados» y orden en Aprende): los de la propuesta, sin «Enjoy para tu sala».
        sg['modules'] = [
            {'module_key': 'portada', 'priority': 1, 'fit': 'El nombre del local y qué cambia para él.'},
            {'module_key': 'lo-que-te-pasa', 'priority': 1, 'fit': 'Sus problemas de hoy, contados desde su silla.'},
            {'module_key': 'pantalla-en-vivo', 'priority': 1, 'fit': 'Su pantalla, manejada desde su móvil.'},
            {'module_key': 'movil-invitado', 'priority': 1, 'fit': 'Lo que va a hacer su gente y lo que significa para él.'},
            {'module_key': 'tabs-experiencias', 'priority': 2, 'fit': 'Dinámicas que ya se hacen: por mesa, chupito por fotos, sorteo.'},
            {'module_key': 'pricing', 'priority': 3, 'fit': 'Cuota mensual por tramo de aforo.'},
        ]

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('catálogo:', ', '.join(m['key'] for m in t['catalog']))
print('locales:', len(proposal['blocks']), 'bloques ·', len(proposal['questions']), 'preguntas')
