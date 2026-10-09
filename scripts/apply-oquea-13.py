#!/usr/bin/env python3
"""
Oquea · Aprende por piezas, condiciones del comercial y la alianza internacional (Cristian, 9-oct-2026):
- Temas de Aprende (tenant.json → learn_topics): cada pieza del producto contada al comercial, primero qué es (con su UI,
  por partes) y después cómo contarlo. Sustituyen a la lista de diapositivas («Portada», «Siguiente paso», «ONG ·
  Insignia»…) en «Qué ofrecemos». Textos sacados del documento 01, del catálogo del centro (05), de la guía de inicio y
  de lo que contó Cristian; lo que viene sin fecha va marcado como tal.
- «Por qué funciona» deja de ser la procedencia: cada why_it_works pasa a «Fuente: …» (se ve como nota al pie) y las
  ideas que redactó la sesión llevan además su porqué.
- Condiciones del comercial (commissions.default_plan, visibles para quien no tenga las suyas): 70 % de lo que gana Oquea
  en las transacciones de sus centros (Oquea se queda el 10 % de cada una) durante 6 meses desde la primera; igual en la
  intermediación de la alianza; suscripciones que venda, 50 % durante 6 meses.
- Alianza internacional (red de centros fundadores): Oquea como intermediario entre centros y tour operadores, con
  descuentos cruzados; su comisión de intermediación se estima en un 3–5 % (sin cerrar; antes «en torno al 2 %»).
Idempotente.

    python3 scripts/apply-oquea-13.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
F = 'asset:img/fondos/'
plays = {p['key']: p for p in t['playbook']}

# ------------------------------------------------------------------ condiciones del comercial
TEAM_NOTE = (
    'Cuando uno de tus centros hace su primera transacción con Oquea, empieza el reloj: 6 meses.\n'
    'Oquea se queda el 10 % de cada transacción de ese centro; de ese 10 %, el 70 % es tuyo. Lo mismo con lo que '
    'Oquea gane como intermediario en la alianza internacional.\n'
    'Si vendes suscripciones (fidelización y lo que vaya llegando), el 50 % es tuyo durante 6 meses.\n'
    'Pasados los 6 meses, lo que se genere es de Oquea. Cuando estén conectados los cobros, verás aquí cuándo se '
    'genera cada ingreso y cuánto te toca.'
)
t['commissions'] = {'default_plan': {
    'name': 'Comercial · centros fundadores',
    'show_to_team': True,
    'team_note': TEAM_NOTE,
    'rules': [
        {'id': 'transacciones-6m', 'label': '70 % de lo que gana Oquea en tus centros · 6 meses desde su primera transacción',
         'when': {'kinds': ['sale', 'volume'], 'monthsTo': 6, 'monthsAnchor': 'first'}, 'pay': {'type': 'percent', 'pct': 70}},
        {'id': 'suscripciones-6m', 'label': '50 % de las suscripciones que vendas · 6 meses',
         'when': {'kinds': ['recurring'], 'monthsTo': 6, 'monthsAnchor': 'first'}, 'pay': {'type': 'percent', 'pct': 50}},
    ],
}}
plays['condiciones-del-comercial']['body'] = (
    '**70/30 durante 6 meses.** El reloj empieza con la primera transacción de uno de tus centros. Oquea se queda el '
    '10 % de cada transacción de ese centro; de ese 10 %, el 70 % es tuyo y el 30 %, de Oquea. Pasados los 6 meses, el '
    '100 % es de Oquea.\n\n'
    '**Lo mismo con la alianza internacional:** de lo que Oquea gane como intermediario entre centros, el 70 % es tuyo '
    'durante 6 meses.\n\n'
    '**Suscripciones** (fidelización y lo que vaya llegando): si las vendes tú, 50/50 durante 6 meses.\n\n'
    'Es así para todo, por ahora. Cuando estén conectados los cobros, lo verás en «Mis comisiones».'
)
plays['condiciones-del-comercial']['why_it_works'] = 'Fuente: Cristian, 9-oct-2026 (de palabra).'

# ------------------------------------------------------------------ alianza internacional
mb = plays['modelo-de-negocio']
mb['body'] = mb['body'].replace(
    '- Comisión dentro de la red: en torno al 2 %, cifra no cerrada. SUPUESTO, sin funcionalidad.',
    '- Intermediación en la alianza internacional (red de centros fundadores): Oquea hace de intermediario entre centros '
    'y tour operadores de la alianza, con descuentos cruzados (quien ha buceado en Europa va luego a Asia con descuento). '
    'Por los clientes que se cruzan, Oquea se queda un porcentaje menor que el 10 %: estimado entre el 3 y el 5 % '
    '(Cristian, 9-oct-2026; antes «en torno al 2 %»). Sin cerrar ni funcionalidad: no se dice ninguna cifra.')
assert '3 y el 5 %' in mb['body']

# ------------------------------------------------------------------ «por qué funciona»: el porqué, y la fuente aparte
WHY = {
    'idea-publicidad': 'Los centros ya piden a sus clientes que les etiqueten en redes; aquí no tienen que pedirlo, y cada post llega a los amigos del buceador.',
    'idea-que-vuelvan': 'Para un centro, el cliente que repite (avanzado, especialidades, viajes del club) es la venta más fácil, y hoy casi ninguno sabe quién ha venido.',
    'idea-cero-trabajo': 'La objeción de fondo de cualquier herramienta nueva es el trabajo extra. Aquí es una frase en el briefing.',
    'idea-viajero': 'El buceador que viaja busca dónde bucear antes de ir; estar en el mapa es estar donde busca.',
    'idea-no-sustituye': 'Quien ya paga un programa teme tener que cambiarlo. Decir que no lo toca quita la objeción antes de que salga.',
    'ong-idea-mas-gente': 'Lo que mide una ONG es cuánta gente participa; el mapa le da una entrada que no depende solo de sus redes.',
    'ong-idea-comunidad': 'Hoy los asistentes se quedan repartidos en las hojas de cada centro; tenerlos juntos es lo que le permite volver a convocarlos.',
    'ong-idea-insignia': 'Un recuerdo que se comparte hace de anuncio del siguiente evento.',
}
for p in t['playbook']:
    w = (p.get('why_it_works') or '').strip()
    if not w:
        continue
    lines = [x for x in w.split('\n') if x.strip()]
    if any(x.startswith('Fuente:') for x in lines):
        src = [x for x in lines if x.startswith('Fuente:')]
        rest = [x for x in lines if not x.startswith('Fuente:')]
    else:
        # Lo de antes era la procedencia (documento, guion, Cristian, la sesión): va como fuente.
        src = ['Fuente: ' + ' '.join(lines).replace('Redactado por la sesión (Claude, 9-oct-2026) a partir de', 'redactado a partir de')]
        rest = []
    why = WHY.get(p['key'])
    p['why_it_works'] = '\n'.join(([why] if why else rest) + src)

# ------------------------------------------------------------------ temas de Aprende
S = lambda title, body, ui=None: {'title': title, 'body': body, 'ui': ui}
t['learn_topics'] = [
    {'key': 'mapa', 'name': 'El mapa del buceo', 'image': F + 'rayos-peces.webp', 'ui': 'app:map', 'modules': ['perfil-y-mapa'],
     'summary': 'Puntos de inmersión, centros, ONGs y eventos, en todo el mundo. Donde el buceador que viaja encuentra al centro.',
     'sections': [
        S('Qué hay en el mapa',
          'Los **puntos de inmersión** (la boya azul), los **centros de buceo** y las **ONGs**, cada uno con su marcador. '
          'Cuando uno tiene un evento, lleva una insignia encima. Hoy el mapa tiene datos de **España, Latinoamérica y Corea**.', 'app:map'),
        S('El perfil del centro',
          'Cada centro tiene un perfil público: web, idiomas, ubicación en el mapa, equipo, contacto y certificadoras. '
          'Es lo que ve un buceador al tocar su marcador. Lo rellena el centro al darse de alta y se verifica en menos de 24 h.', 'console:centre'),
        S('Para qué le sirve al centro',
          'Que le encuentre quien prepara un viaje: un buceador de Corea que va a España, o uno de España que va a Asia. '
          'Para un **centro destino** es lo que más importa. **Nunca** digas cuántas visitas o clientes le llegarán: no hay datos.'),
        S('Lo que viene (sin fecha)',
          'Apuntarse a las actividades de un centro desde el mapa (Cristian, 9-oct-2026). Hoy solo los eventos de ONG '
          'admiten inscripción desde el mapa. Es para que lo sepas tú: al centro no se le promete.'),
     ]},
    {'key': 'tarjetas', 'name': 'Tarjetas para compartir', 'image': 'asset:img/exportables/1-inmersion.webp', 'ui': 'app:share-card', 'modules': ['tu-nombre'],
     'summary': 'Cada inmersión, una tarjeta para Instagram con el nombre del centro. Publicidad que el centro no paga.',
     'sections': [
        S('Qué es',
          'Desde su logbook, el buceador exporta una imagen de su inmersión para compartirla en redes: la de la inmersión, '
          'la de récord personal, la de hito, la de viaje y la de especie. Es su foto con los datos encima (tiempo, '
          'profundidad, temperatura, lo que vio) y un diseño cuidado.', 'app:share-card'),
        S('Con el nombre del centro',
          'Todas llevan la línea **«with [centro]»**: el nombre del centro con el que buceó. Cada vez que un buceador la '
          'publica, sale el centro. **Nunca** digas que la gráfica de la tarjeta es el perfil real de la inmersión: está por confirmar.'),
        S('Por qué le importa al centro',
          'Los centros ya piden a sus clientes que les etiqueten. Aquí no tienen que pedirlo: va en cada tarjeta, y llega a '
          'los amigos del buceador, que también bucean. En la visita se enseña con el móvil y se señala la línea del centro.'),
     ]},
    {'key': 'logbook', 'name': 'Modo Strava: el logbook', 'image': F + 'pareja-arrecife.webp', 'ui': 'app:logbook', 'modules': ['como-funciona'],
     'summary': 'El historial de todas las inmersiones del buceador, con su perfil y sus récords. Por eso quiere escanear.',
     'sections': [
        S('Qué es',
          'El logbook digital del buceador: todas sus inmersiones, en orden, con el punto, la fecha y el centro. Se rellena '
          'solo cada vez que escanea un QR: no escribe nada.', 'app:logbook'),
        S('Cada inmersión, con sus datos',
          'Profundidad, tiempo, visibilidad y vida marina del punto de inmersión (los datos que el centro ya tiene cargados), '
          'las fotos del álbum y con quién buceó.', 'app:dive-detail'),
        S('Su perfil de buceador',
          'Su nivel, sus certificaciones y su historial, como un perfil de Strava pero bajo el agua. Es lo que hace que '
          'vuelva a la app y que le pida al centro el QR.', 'app:diver-profile'),
     ]},
    {'key': 'panel', 'name': 'El panel del centro', 'image': 'asset:img/producto/web/01-panel-centro-actividades.png', 'ui': 'console:today', 'modules': ['consola'],
     'summary': 'Desde el ordenador: las salidas del día, quién viene, el equipo y los clientes. Es la herramienta de gestión.',
     'sections': [
        S('Hoy',
          'Las salidas del día y cuántos buceadores tiene ya el centro en su lista. Es lo primero que ve el centro al entrar.', 'console:today'),
        S('Crear las salidas',
          'Cada salida es un hueco con hora, punto de inmersión, disciplina (scuba, freediving o snorkel) y tipo (fun dive, '
          'bautizo o curso). Es lo único que el centro hace cada día: sin salida creada, el QR no tiene qué guardar.', 'console:activity'),
        S('Puntos de inmersión y equipo',
          'El centro da de alta sus puntos de inmersión con los datos precargados (profundidad máxima, tiempo habitual, '
          'visibilidad, vida marina) e invita a su equipo con roles (owner, admin). Si le da pereza montarlo, se lo montamos.', 'app:dive-sites'),
        S('Su QR',
          'Un QR único por centro, para el barco o el local. Cuanto más visible, más escaneos.', 'app:center-qr'),
     ]},
    {'key': 'qr', 'name': 'El QR: escanear y guardar', 'image': 'asset:img/producto/web/02-registro-qr-logbook.png', 'ui': 'app:qr-scan', 'modules': ['como-funciona'],
     'summary': 'Al volver de bucear, el buceador escanea el QR del centro y guarda la inmersión. Medio minuto, sin instalar nada.',
     'sections': [
        S('Escanea, sin instalar nada',
          'Con la cámara del móvil. Se abre en el navegador (oquea.app): no hay que descargar ninguna app.', 'app:qr-scan'),
        S('Elige la salida de hoy',
          'Ve las salidas de hoy de ese centro (y, en una opción secundaria, las de los tres días anteriores) y elige la suya.', 'app:qr-pick'),
        S('Y queda en su logbook',
          'Se crea su perfil si no lo tenía y la inmersión se guarda con los datos del punto ya rellenos. El centro, a la '
          'vez, lo tiene en su lista.', 'app:dive-saved'),
        S('Quién lo dice',
          'Quien da el briefing en el barco: «escanead el QR». Si a esa persona le supone trabajo extra, el QR no se usa. '
          'Por eso en la visita preguntas quién lo dirá.'),
     ]},
    {'key': 'crm', 'name': 'El CRM: los buceadores del centro', 'image': 'asset:img/producto/web/04-crm-perfil-buceador.png', 'ui': 'console:crm', 'modules': ['tus-buceadores'],
     'summary': 'Cada buceador que escanea entra en la lista del centro con su historial. Para cuidarlos y que vuelvan.',
     'sections': [
        S('Se llena solo',
          'Cada persona que guarda una inmersión con el QR del centro entra en su lista, con todo lo que ha hecho con él. '
          'Sin papeles ni hojas de cálculo.', 'console:crm'),
        S('La ficha de cada buceador',
          'Quién es, su nivel, cuántas veces ha venido, qué ha hecho y cuándo fue la última. Es lo que el centro mira para '
          'saber a quién proponer el avanzado, la próxima salida o el viaje del club.', 'app:crm-diver'),
        S('Altas a mano',
          'Si alguien no escaneó, el centro lo añade a mano y el buceador confirma por correo.'),
        S('Lo que no hace hoy',
          'No envía campañas, ni descuentos, ni nada automático: la lista se consulta y el centro contacta él mismo. '
          '**Nunca** digas remarketing o fidelización automática. Las mejoras del CRM llegan después, sin fecha.'),
     ]},
    {'key': 'album', 'name': 'El álbum de cada inmersión', 'image': F + 'tiburon-ballena.webp', 'ui': 'app:album', 'modules': ['album'],
     'summary': 'Las fotos del día, para todo el grupo, durante 30 días. Sin pedir teléfonos.',
     'sections': [
        S('Qué es',
          'Cada inmersión tiene un álbum compartido. El centro y los buceadores suben sus fotos y vídeos y todo el grupo los '
          've, durante treinta días. Sin grupos de WhatsApp ni pedir teléfonos.', 'app:album'),
        S('Cada foto',
          'Se ve a pantalla completa, con quién la subió, y se puede descargar.', 'app:album-photo'),
        S('Para quién lleva las redes',
          'Es el contenido del día del centro, ya reunido. Cuándo sacarlo: si el centro comparte fotos con sus clientes o hace fotos en las inmersiones.'),
     ]},
    {'key': 'ong', 'name': 'Eventos de ONG', 'image': F + 'buceadores-tortuga.webp', 'ui': 'app:event', 'modules': ['eventos', 'ong-eventos', 'ong-insignia', 'ong-participantes', 'ong-mapa'],
     'summary': 'Las ONGs organizan acciones (limpiezas…) con varios centros a la vez. Y traen a su comunidad a Oquea.',
     'sections': [
        S('Qué es una ONG en Oquea',
          'Una organización de conservación marina con su propio perfil (además de los de buceador y centro). Organiza '
          'acciones como limpiezas de fondos con varios centros de buceo colaboradores.'),
        S('El evento, en varios centros a la vez',
          'La ONG crea el evento y la gente se apunta desde el mapa en el centro que le queda más cerca. Cada centro ve '
          'quién va a venir al suyo. Hoy solo las ONGs pueden crear eventos.', 'app:event'),
        S('La insignia',
          'Cada asistente escanea el QR de su centro y se lleva la insignia del evento en su perfil, que puede compartir.', 'app:badge'),
        S('Por qué nos importa',
          'La ONG tiene a todos los participantes de todos los centros, y será de las primeras en el remarketing (sin fecha). '
          'Lo que queremos de ella es su comunidad: cada evento mete en Oquea a los asistentes y a sus centros.'),
     ]},
    {'key': 'alianza', 'name': 'La alianza internacional', 'image': F + 'pared-azul.webp', 'ui': None, 'modules': ['red-fundadores', 'condiciones', 'en-preparacion'],
     'summary': 'La red de centros fundadores de varios países, con Oquea de intermediario. Y cómo gana Oquea.',
     'sections': [
        S('Qué es',
          'Oquea está firmando con centros de distintos países para que los buceadores de unos conozcan a los otros. Los '
          'primeros en firmar son los **centros fundadores**. Se llama red o alianza: **nunca** «cooperativa».'),
        S('Oquea, de intermediario',
          'La idea es que la alianza conecte centros y tour operadores con descuentos cruzados: quien ha buceado en Europa va '
          'luego a Asia con descuento por ser de la alianza. Oquea hace de intermediario y se queda un porcentaje por los '
          'clientes que se cruzan (estimado entre el 3 y el 5 %, sin cerrar). Hoy no hay ningún descuento firmado: no digas cifras.'),
        S('Cómo gana Oquea hoy',
          'Para el centro, todo lo que ve es gratis. Cuando Oquea le lleva un cliente nuevo, se queda un 10 % de esa reserva '
          '(en España, la cifra está por cerrar). Si no hay reserva, no hay comisión. Más adelante habrá funciones de pago '
          '(fidelización, facturación) que cada centro decidirá si contrata.'),
        S('En preparación (sin fecha)',
          'Reserva y cobro online desde Oquea. No existe todavía; se avisará a los centros fundadores. Fuera de España, nada '
          'de fechas hasta que esté cerrada la revisión legal de pagos.'),
        S('Lo que ganas tú',
          'El 70 % de lo que gane Oquea con tus centros (y con la intermediación) durante 6 meses desde su primera '
          'transacción; y el 50 % de las suscripciones que vendas, 6 meses. Lo tienes en «Mis comisiones».'),
     ]},
]
for tp in t['learn_topics']:
    assert len(tp['name']) <= 80 and len(tp['summary']) <= 300, tp['key']
    for s in tp['sections']:
        assert len(s['title']) <= 80 and len(s['body']) <= 2000, (tp['key'], s['title'])

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'oquea 13: {len(t["learn_topics"])} temas, condiciones del equipo ({len(t["commissions"]["default_plan"]["rules"])} reglas), fuentes aparte')
