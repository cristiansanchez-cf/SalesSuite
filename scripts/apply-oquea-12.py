#!/usr/bin/env python3
"""
Aprende · las fichas de sector de Oquea (centros de buceo y ONGs), rehechas con lo que pidió Cristian (9-oct-2026):
- Más contexto de qué es un centro por dentro y más gente en la decisión (dueño, instructor jefe, operaciones,
  recepción y reservas con su programa de gestión, quien lleva las redes, el equipo del barco, el socio).
  Investigación con fuentes: docs/ventas/oquea/fuentes/06-investigacion-centros-y-ongs.md.
- «Cómo funciona en este cliente», contado AL COMERCIAL (proposal.learn): quién hace qué dentro, paso a paso, con la UI.
  Antes enseñaba las diapositivas de la propuesta, que le hablan al centro («Tu nombre en cada inmersión»).
- «Ideas para contarlo»: ángulos para la conversación, no la lista de funciones. Las frases literales del guion
  («La tarjeta: sale tu nombre», «La lista», «El álbum») pasan a guiones de la demo; «Qué recibe el centro» a condiciones.
- ONG: un perfil más complejo (dirección, coordinación de eventos, comunicación, centros, junta) y lo que queremos de
  ella: su comunidad (cada evento mete a todos los asistentes en Oquea).
- El recorrido, paso 8: el 10 % sí se le dice al centro (en las condiciones del guion); lo que no se dice es el
  porcentaje de la pasarela.
Lo redactado aquí es de la sesión (Claude) a partir del documento 01, el guion de campo, lo que contó Cristian y la
investigación: lo dice cada «why_it_works». Idempotente.

    python3 scripts/apply-oquea-12.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
SRC = 'Redactado por la sesión (Claude, 9-oct-2026) a partir de'
INV = 'docs/ventas/oquea/fuentes/06-investigacion-centros-y-ongs.md'
seg = {s['key']: s for s in t['market']}
C, O = seg['centros-buceo'], seg['ong']

# ------------------------------------------------------------------ recorrido, paso 8
for s in t['tour']:
    if s['title'].startswith('Gratis para el centro'):
        s['body'] = ('Hoy el centro no paga nada. Cuando Oquea le lleva un cliente nuevo, Oquea se queda un 10 % de lo '
                     'generado (en España, aún por cerrar). Se le dice en las condiciones, después de la demo.')
        assert len(s['body']) <= 240

# ------------------------------------------------------------------ centros de buceo
C['description'] = (
    'Centros de buceo: bautizos, cursos y salidas con buceadores certificados; muchos tienen tienda y organizan viajes. '
    'Por dentro suele haber un dueño o director, alguien que planifica las salidas (barco, personal y material), '
    'recepción y reservas (consultas por email y WhatsApp, papeles de los alumnos y su programa de gestión), '
    'instructores, divemasters y la tripulación del barco. En los pequeños, el dueño hace casi todo. Un mismo centro '
    'puede ser destino (recibe buceadores de fuera) y emisor (sus buceadores viajan).'
)
C['value_prop'] = (
    'Sus buceadores guardan cada inmersión con un QR y la comparten con el nombre del centro; el centro se queda con '
    'la lista de quién ha buceado con él y aparece en el mapa para buceadores de todo el mundo. Sin coste.'
)
C['buying_process'] = (
    'Firma el dueño (o el socio, si lo hay: no cierres sin él). Influyen el instructor jefe, que manda en el agua, y '
    'quien planifica las salidas, que es quien creará las actividades en Oquea cada día. Lo usan recepción (altas a mano, '
    'dudas de clientes) y quien está en el barco, que dice «escanead el QR» en el briefing. Si a esa persona le supone '
    'trabajo extra, el QR no se usa. Quién es quién: SUPUESTO del sector con ofertas de empleo de PADI como fuente.'
)
FITS = {
    'como-funciona': 'Siempre: el QR, el logbook y la lista, en tres pasos.',
    'tu-nombre': 'Siempre que quepa: la tarjeta con «with [centro]», publicidad que no paga.',
    'condiciones': 'Siempre: sin coste; el 10 % solo si Oquea le lleva un cliente nuevo.',
    'tus-buceadores': 'Si le preocupa que vuelvan o no guarda nada de sus buceadores.',
    'perfil-y-mapa': 'Centro destino (quiere buceadores de fuera) o si organiza viajes con su club.',
    'album': 'Si comparte fotos con sus clientes o cuida sus redes.',
    'eventos': 'Si colabora con una ONG.',
}
for m in C['modules']:
    m['fit'] = FITS.get(m['module_key'], m['fit'])

def persona(key, name, role, goals, pains=None, kpis=None, objections=(), how=None, avoid=None, help=None, block=None):
    return {'key': key, 'name': name, 'role': role, 'goals': goals, 'pains': pains, 'kpis': kpis, 'objections': list(objections),
            'how_to_approach': how, 'avoid': avoid, 'can_help': help, 'can_block': block, 'angles': []}

C['personas'] = [
    persona('dueno-centro', 'Dueño o director del centro', 'decisor',
            'Llenar las salidas y los cursos, que entren buceadores nuevos (de fuera, si es centro destino) y que los de siempre vuelvan.',
            pains='Más allá de la hoja de salida, no le queda nada de quien bucea con él. Las redes las lleva él o nadie. SUPUESTO.',
            kpis='Salidas llenas, cursos vendidos, clientes que repiten. SUPUESTO.',
            objections=['desconfianza', 'tiempo', 'ya_tengo_proveedor'],
            how='En persona, con el móvil en la mano: primero se pregunta, luego se enseña. En un centro pequeño también da cursos y lleva el barco: no le pilles cargándolo.',
            avoid='Abrir con lo que está por llegar (pasarela, red internacional): entiende que hoy no hay nada.',
            help='Firma el acuerdo de centro fundador.', block='No firma o firma y no pone el QR.'),
    persona('socio', 'Socio', 'guardian',
            'Que nada comprometa el negocio: dinero, datos de los clientes, trabajo extra para el equipo. SUPUESTO.',
            objections=['no_decido_yo', 'desconfianza'],
            how='Si el dueño dice «lo tengo que hablar con mi socio», propón una reunión con los dos, con fecha y objetivo, y ciérrala con «¿de acuerdo?».',
            avoid='Dejar la decisión en una conversación en la que no estás.',
            help='Si está en la reunión, la firma sale ese día.', block='Si no estaba en la conversación, la firma se para.'),
    persona('jefe-instructores', 'Instructor jefe o director de buceo', 'influenciador',
            'Que la operación en el agua sea segura y ordenada, y que los alumnos sigan formándose (avanzado, especialidades). En centros pequeños, es quien decide con el dueño.',
            objections=['tiempo'],
            how='Enséñale que el QR no añade nada al briefing: una frase. Y que el logbook del alumno queda relleno con los datos del punto de inmersión.',
            avoid='Que parezca que cambia cómo bucean o cómo se registra la seguridad.',
            help='Convence al dueño y hace que su equipo lo diga en cada briefing.', block='Si cree que complica el briefing, no entra en el barco.'),
    persona('operaciones', 'Gerente o responsable de operaciones', 'campeon',
            'Planifica las salidas del día: barco, personal, material y quién va a cada una (fuente: ofertas de empleo de PADI).',
            pains='Las salidas ya las tiene en su programa o en una hoja: no quiere duplicar trabajo. SUPUESTO.',
            objections=['tiempo', 'ya_tengo_proveedor'],
            how='Es quien creará las salidas del día en el panel de Oquea. Enséñale que son tres datos (hora, punto, tipo) y que los puntos de inmersión los damos de alta nosotros si quiere.',
            avoid='Decir que Oquea reserva, cobra o sustituye su programa: hoy no.',
            help='Crea las salidas cada día: sin eso, el QR no tiene qué guardar.', block='Si le duplica trabajo, no las crea y el QR se queda vacío.'),
    persona('recepcion-reservas', 'Recepción y reservas', 'usuario',
            'Atiende consultas por email y WhatsApp, reservas, check-in, papeles de los alumnos y certificaciones. Suele llevar el programa de gestión del centro (Dive Shop 360, Bloowatch, EVE…) o una hoja de cálculo.',
            objections=['ya_tengo_proveedor', 'tiempo'],
            how='Pregunta qué programa usan. Oquea no lo sustituye ni se conecta a él: es el QR, el logbook del buceador y la lista. Si un cliente no escanea, desde aquí se le da de alta a mano.',
            avoid='Prometer integración con su programa o con WhatsApp: no existe.',
            help='Resuelve las dudas de los clientes sobre Oquea y da de alta a mano a quien no escaneó.', block='Si lo ve como otra herramienta que mantener.'),
    persona('quien-esta-en-el-barco', 'Instructores y guías (quien está en el barco)', 'usuario',
            'Dar los cursos y guiar las inmersiones; en el briefing, decir «escanead el QR».',
            objections=['tiempo'],
            how='Pregunta en el descubrimiento quién dirá «escanead el QR» y enséñale lo único que tiene que hacer. SUPUESTO por validar en campo.',
            avoid='Que le suponga trabajo extra.',
            help='Lo menciona en el briefing y el QR se usa.', block='Si le supone trabajo extra, el QR no se usa.'),
    persona('redes-sociales', 'Quien lleva las redes del centro', 'campeon',
            'Fotos y vídeos del día en Instagram y Facebook; que los clientes etiqueten al centro y lo compartan (práctica habitual del sector: ver fuentes). A menudo es el dueño o un instructor.',
            how='Enséñale la tarjeta con «with [centro]» y el álbum de 30 días: contenido del día sin pedírselo a nadie.',
            avoid='Prometer alcance o seguidores: no hay datos.',
            help='Anima a los buceadores a compartir su tarjeta.', block=None),
]

L = lambda title, body, ui=None: {'title': title, 'body': body, **({'ui': ui} if ui else {})}
C['proposal']['learn'] = [
    L('El centro prepara las salidas del día',
      'Quien planifica (el gerente u operaciones; en un centro pequeño, el dueño) crea en el panel las salidas: hora, '
      'punto de inmersión y tipo (fun dive, bautizo o curso). Los datos del punto ya están cargados. Es lo único que el '
      'centro tiene que hacer cada día; si le da pereza montarlo, se lo montamos.', 'console:today'),
    L('En el barco: «escanead el QR»',
      'El guía o el instructor lo dice en el briefing. Cada buceador escanea con la cámara del móvil, **sin instalar '
      'nada**, y elige la salida de hoy. Si a esa persona le supone trabajo extra, el QR no se usa: por eso preguntas '
      'en la visita quién lo dirá.', 'app:qr-scan'),
    L('El buceador tiene su logbook relleno',
      'La inmersión se guarda con los datos del punto: profundidad, visibilidad y vida marina. No escribe nada y tiene '
      'su historial, con su perfil y sus récords: el «modo Strava». Es lo que hace que el buceador quiera escanear.',
      'app:dive-saved'),
    L('Lo comparte, y sale el nombre del centro',
      'Desde el logbook exporta una tarjeta para Instagram con «with [centro]». Los centros ya piden a sus clientes que '
      'les etiqueten: esto lo hace solo, en cada inmersión. Para el centro es publicidad que no paga.', 'app:share-card'),
    L('Las fotos del día, para todo el grupo',
      'Durante 30 días, buceadores y centro suben las fotos de esa inmersión a un álbum compartido. A quien lleva las '
      'redes del centro le da el contenido del día.', 'app:album'),
    L('El centro se queda con sus buceadores',
      'Cada buceador que escanea entra en la lista del centro con su historial: quién es, cuántas veces ha venido y qué '
      'ha hecho. Hoy el centro la consulta y contacta él mismo (Oquea **no** envía campañas). Le sirve para que vuelvan: '
      'saber a quién proponer el avanzado, la próxima salida o el viaje del club.', 'console:crm'),
    L('Le encuentran buceadores de fuera',
      'Su perfil (idiomas, certificadoras, equipo y contacto) sale en el mapa de Oquea, hoy con datos de España, '
      'Latinoamérica y Corea. A un centro destino es lo que más le importa: que le descubra quien prepara un viaje. '
      'Nunca digas cuántos clientes le llegarán.', 'app:map'),
    L('Las condiciones, al final',
      'Todo lo que has visto, sin coste. El día que Oquea le lleve un cliente nuevo, se queda un 10 % de lo generado '
      '(en España, por cerrar). A cambio pides tres cosas en voz alta: la firma, el QR en el barco y que quien da el '
      'briefing lo diga.'),
]

# Ideas para contarlo: ángulos (pitch del sector); las frases literales del guion, a guiones de la demo.
KIND = {'campo-tarjeta': 'script', 'campo-lista': 'script', 'campo-album': 'script', 'que-recibe-el-centro': 'monetization'}
for p in t['playbook']:
    if p['key'] in KIND:
        p['kind'] = KIND[p['key']]

def play(key, title, body, when, segs, why, module=None, kind='pitch', stage='pitch_demo'):
    return {'key': key, 'module_key': module, 'kind': kind, 'stage': stage, 'objection': None, 'segments': segs, 'personas': [],
            'audience': 'all', 'about': False, 'pinned': None, 'title': title, 'body': body, 'when_to_use': when,
            'why_it_works': why, 'technique_refs': [], 'status': 'official'}

IDEAS_C = [
    play('idea-publicidad', 'Publicidad que no paga',
         'Sus buceadores ya suben la inmersión a Instagram. Pregunta: «¿Sale en algún sitio que fue con vosotros?». '
         'Con Oquea, cada tarjeta que comparten lleva «with [centro]». Cada post es publicidad del centro, sin pagar '
         'nada ni tener que pedir que le etiqueten.',
         'Si publica en redes o tiene fotos de clientes en su web (lo miras antes de ir).', ['centros-buceo'],
         f'{SRC} la apertura del guion de campo y la investigación ({INV} §3).', module='tu-nombre'),
    play('idea-que-vuelvan', 'Que vuelvan los que ya vinieron',
         'Pregunta: «Después de la inmersión, ¿qué os queda de esa persona?». Casi siempre, un nombre en la hoja de '
         'salida. Con Oquea, cada buceador que escanea se queda en su lista con su historial, y él decide a quién '
         'llamar: el avanzado, la próxima salida, el viaje del club.\n\n**Nunca** digas que Oquea envía campañas o hace '
         'remarketing: hoy la lista se consulta.',
         'Cuando le preocupa no saber quién bucea con él o vive de cursos y clientes que repiten.', ['centros-buceo'],
         f'{SRC} el documento 01 (§2.1 y §3), el guion (pregunta 5) y la investigación ({INV} §3).', module='tus-buceadores'),
    play('idea-cero-trabajo', 'Cero trabajo extra para su equipo',
         'Lo único que tiene que hacer el centro: crear las salidas del día (hora, punto y tipo) y que quien da el '
         'briefing diga «escanead el QR». El buceador no instala nada. Y si le da pereza montarlo, le damos de alta los '
         'puntos de inmersión y las salidas.',
         'Cuando dice que no tiene tiempo o que ya tiene demasiadas herramientas.', ['centros-buceo'],
         f'{SRC} la guía de inicio («se lo montamos», «sin instalar») y el documento 01 (§2.1).'),
    play('idea-viajero', 'El buceador que viaja le encuentra',
         'Un buceador de Corea, de Latinoamérica o de España que prepara su viaje mira el mapa de Oquea: ahí está el '
         'centro, con sus idiomas, sus certificadoras y su contacto. Para un centro destino es la puerta: «Estamos '
         'firmando con centros de varios países para que los buceadores de unos conozcan a los otros».\n\n**Nunca:** '
         'cuántos clientes le llegarán ni cuándo.',
         'Centro destino: recibe o quiere recibir buceadores de fuera.', ['centros-buceo'],
         f'{SRC} el documento 01 (§2.2 mapa, §7), el ángulo «Abrir mercado» del guion y la investigación ({INV} §4).',
         module='perfil-y-mapa'),
    play('idea-no-sustituye', 'No cambia lo que ya usa',
         'Muchos centros llevan reservas, alumnos y tienda en un programa (Dive Shop 360, Bloowatch, EVE…) o en la app '
         'de su certificadora. Oquea no lo sustituye ni se conecta a él: es un QR en el barco y un logbook para sus '
         'buceadores. «Sigue con ello: esto no cambia nada de lo que ya usas.»',
         'Cuando pregunta si tiene que cambiar de programa o dice que ya tiene uno.', ['centros-buceo'],
         f'{SRC} la objeción «Ya uso la aplicación de mi certificadora» del guion y la investigación ({INV} §2).'),
]

# ------------------------------------------------------------------ ONGs
O['description'] = (
    'ONGs de conservación marina que organizan acciones con centros de buceo, como limpiezas de fondos. Un perfil más '
    'complejo que un centro: dirección, quien coordina los eventos y el voluntariado, comunicación, varios centros '
    'colaboradores y una comunidad de voluntarios y buceadores.'
)
O['value_prop'] = (
    'Su evento en el mapa de Oquea y en todos sus centros a la vez: la gente se apunta en el centro más cercano, cada '
    'asistente se lleva su insignia y la ONG tiene a todos los participantes, de todos los centros. Sin coste. Y será '
    'de las primeras en el remarketing cuando llegue (sin fecha).'
)
O['icp'] = 'ONG con varios centros de buceo colaboradores que organiza eventos (limpiezas u otras acciones) y quiere llegar a más gente.'
O['buying_process'] = (
    'Decide la dirección de la ONG; quien lo empuja es quien coordina los eventos. Comunicación quiere la visibilidad. '
    'Los centros colaboradores lo usan el día del evento. SUPUESTO: un acuerdo con terceros y los datos de los '
    'participantes pueden pasar por su junta.'
)
O['notice'] = (
    'Tipo de cliente nuevo, contado de palabra por Cristian (6 y 9-oct-2026): sin documento ni ventas todavía. El '
    'remarketing es lo que viene: sin fechas. Solo para ti: lo que queremos de la ONG es su comunidad. Cada evento con '
    'Oquea mete en Oquea a todos los asistentes y a sus centros.'
)
O['personas'] = [
    persona('responsable-ong', 'Dirección de la ONG', 'decisor',
            'Que sus acciones lleguen a más gente y tener a la comunidad que participa.',
            objections=['desconfianza'],
            how='Empieza por su próximo evento: dónde, con cuántos centros y cuánta gente espera. Enséñale el evento en el mapa.',
            avoid='Prometer fechas del remarketing.',
            help='Firma el acuerdo y nos abre todos sus centros colaboradores.', block='Si no ve qué gana la ONG, no mueve a sus centros.'),
    persona('junta-ong', 'Junta directiva o patronato', 'guardian',
            'Que los acuerdos con terceros y los datos de los participantes estén bien. SUPUESTO.',
            objections=['desconfianza', 'no_decido_yo'],
            how='Que la dirección lleve las condiciones por escrito: todo gratis, qué datos ve la ONG (los participantes de sus eventos) y qué no se promete.',
            avoid='Hablar de remarketing como si ya existiera.',
            help='Aprueba el acuerdo.', block='Si le preocupan los datos de los participantes.'),
    persona('coordinacion-eventos', 'Coordinación de eventos y voluntariado', 'campeon',
            'Montar el evento con varios centros, saber cuánta gente va a cada uno y que quien asiste se lleve algo.',
            pains='Hoy, inscripciones por formularios, mensajes y hojas en cada centro. SUPUESTO.',
            objections=['tiempo'],
            how='Enséñale lo que le ahorra: el evento en el mapa, la gente apuntada por centro y la insignia para cada asistente.',
            help='Crea el evento en Oquea y empuja a los centros a usar el QR ese día.', block='Si le parece más trabajo que su formulario.'),
    persona('comunicacion-ong', 'Comunicación y redes', 'influenciador',
            'Visibilidad: que el evento se vea y que los asistentes lo compartan.',
            how='La ONG en el mapa con su evento, y la insignia en el perfil de cada asistente, que puede compartir.',
            avoid='Prometer alcance: no hay datos.',
            help='Lo anuncia y lleva a su comunidad a apuntarse desde Oquea.', block=None),
    persona('centro-colaborador', 'Centro colaborador de la ONG', 'usuario',
            'Que el día del evento todo vaya rodado.',
            objections=['tiempo'],
            how='Es un centro de buceo: lo de los centros vale para él. El evento le trae gente que puede volver.',
            help='Usa Oquea el día del evento.', block='Si no lo usa, el evento no queda en Oquea.'),
]
O['proposal']['learn'] = [
    L('La ONG crea su evento',
      'Por ejemplo, una limpieza de fondos con varios centros colaboradores a la vez. Hoy solo las ONGs pueden crear '
      'eventos en Oquea.', 'app:event'),
    L('Sale en el mapa y la gente se apunta',
      'El evento aparece en el mapa de Oquea y la gente se apunta en el centro que le queda más cerca. Cada centro ve '
      'quién va a venir. Más visibilidad, y la gente se apunta antes.', 'app:map'),
    L('El día del evento: QR e insignia',
      'Cada asistente escanea el QR de su centro, la inmersión se guarda en su logbook y se lleva la insignia del '
      'evento de la ONG en su perfil, que puede compartir.', 'app:badge'),
    L('La ONG tiene a toda su comunidad',
      'Todos los que han participado, de todos los centros, en una lista. Hoy la consulta; el remarketing (volver a '
      'convocarlos desde Oquea) llega después y la ONG será de las primeras. **Sin fechas.**', 'console:crm'),
    L('Por qué nos interesa tanto (solo para ti)',
      'Lo que queremos de la ONG es su comunidad. Cada evento con Oquea hace que todos los asistentes entren en Oquea '
      'con su perfil y su logbook, y que sus centros colaboradores empiecen a usar el QR a la vez. Pídele su calendario '
      'de eventos y el contacto de sus centros.'),
    L('El acuerdo',
      'La ONG nos da acceso a sus centros, que usan Oquea en sus eventos. A cambio, todo gratis: la lista de quién ha '
      'participado en todos los centros, ser de las primeras en el remarketing y salir en el mapa para llegar a más gente.'),
]
for m in O['modules']:
    m['fit'] = {'ong-eventos': 'Siempre: el evento con varios centros a la vez.',
                'ong-participantes': 'Siempre: su comunidad, de todos los centros, en una lista.',
                'ong-insignia': 'Lo que se lleva cada asistente y comparte.',
                'ong-mapa': 'Para que la gente le encuentre y se apunte antes.'}.get(m['module_key'], m['fit'])

IDEAS_O = [
    play('ong-idea-mas-gente', 'Más gente en cada evento',
         'Su evento sale en el mapa de Oquea y la gente se apunta en el centro más cercano. No depende solo de sus redes '
         'y sus formularios.', 'Siempre: es lo primero que quiere una ONG.', ['ong'],
         f'{SRC} lo que contó Cristian (6 y 9-oct) y el documento 01 (§2.3).', module='ong-mapa'),
    play('ong-idea-comunidad', 'Toda su comunidad, en una lista',
         'Hoy cada centro tiene a sus asistentes en su hoja. Con Oquea, la ONG tiene a todos los que han participado, de '
         'todos los centros. Y cuando llegue el remarketing, será de las primeras (sin fechas).',
         'Cuando organiza con varios centros.', ['ong'],
         f'{SRC} lo que contó Cristian (6-oct) y la jugada «Remarketing: lo que viene».', module='ong-participantes'),
    play('ong-idea-insignia', 'Que se acuerden de que vinieron',
         'Cada asistente se lleva la insignia del evento en su perfil de Oquea y la puede compartir. Es el recuerdo del '
         'evento y su mejor anuncio para el siguiente.', 'Con quien lleva comunicación o voluntariado.', ['ong'],
         f'{SRC} lo que contó Cristian (6-oct: «le damos un badge»).', module='ong-insignia'),
    play('ong-lo-que-queremos', 'Lo que queremos de la ONG: su comunidad',
         'Cristian: lo que queremos de la ONG es que nos dé sus contactos, «porque cuando ellos hacen un evento, todo '
         'el mundo se tiene que descargar Oquea». Cada evento mete en Oquea a todos los asistentes y a sus centros.\n\n'
         'Pídele el calendario de eventos y el contacto de sus centros colaboradores. A la ONG no se le dice así: se le '
         'cuenta lo que gana ella.',
         'Para ti, antes de la visita.', ['ong'], 'Cristian, 9-oct-2026 (de palabra, al revisar la ficha de las ONGs).',
         kind='tip', stage='prospeccion'),
]

# Las ideas nuevas, delante de las del guion en su sector (el orden de la lista es el orden en la app).
new = {p['key']: p for p in IDEAS_C + IDEAS_O}
t['playbook'] = [p for p in t['playbook'] if p['key'] not in new]
at = next(i for i, p in enumerate(t['playbook']) if p['key'] == 'que-recibe-el-centro')
t['playbook'][at:at] = IDEAS_C
at = next(i for i, p in enumerate(t['playbook']) if p['key'] == 'ong-pitch') + 1
t['playbook'][at:at] = IDEAS_O

for s in (C, O):
    for k in ('description', 'value_prop'):
        assert len(s[k]) <= 1000, (s['key'], k, len(s[k]))
    assert len(s['buying_process']) <= 2000
    for st in s['proposal']['learn']:
        assert len(st['title']) <= 80 and len(st['body']) <= 600, st['title']
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'oquea 12: centros {len(C["personas"])} personas y {len(C["proposal"]["learn"])} pasos; '
      f'ONG {len(O["personas"])} personas y {len(O["proposal"]["learn"])} pasos; {len(new)} ideas')
