#!/usr/bin/env python3
"""
Aplica a tenants/oquea/tenant.json el guion de campo «Centro de buceo → acuerdo de centro fundador» (v0, 6-oct-2026,
NO VERIFICADO EN CAMPO, docs/ventas/oquea/fuentes/03-guion-campo.md). Va después de apply-oquea-05.py. Idempotente.

Cada paso del guion es una jugada del sector «Centros de buceo», con su etapa y, en las objeciones, su tipo. Las frases
de los creadores van literales y con su ficha (technique_refs); las adaptaciones de Oquea, marcadas como tales.
Ninguna está validada: el aviso va en la primera jugada y en cada objeción.

    python3 scripts/apply-oquea-03b.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
SRC = 'Guion de campo v0 (6-oct-2026). NO VERIFICADO EN CAMPO.'
OWN = SRC + ' Redacción propia de Oquea, no de los creadores.'


def ref(title, creator, url):
    return {'source': 'cerebro', 'title': title, 'creator': creator, 'url': url}


AYC = 'Alfonso y Cristian'
TREJO = 'Manuel Trejo'
R_APERTURA = ref('Apertura de puerta fría presencial', AYC, 'https://open.spotify.com/episode/2N4ZLA1GesZckmsN8MTDTk')
R_ENTREVISTA = ref('Primera visita como entrevista; visita ligera', AYC, 'https://open.spotify.com/episode/1qEbOhyXy2uxMXxIz0cv5Y')
R_TREJO = ref('Ley de cerrar o acordar; el que no cierra, acuerda; seguimiento con valor nuevo', TREJO, 'https://www.youtube.com/watch?v=889o05Z04v8&t=2013')
R_CTA = ref('Una sola llamada a la acción', AYC, 'https://open.spotify.com/episode/46JdjBSJXp2Zao9nUliskK')
R_CRITERIOS = ref('Criterios de éxito antes de la prueba', AYC, 'https://open.spotify.com/episode/3n5l7dpxFqkJOlYq0wVOtu')
R_TIEMPO = ref('Respuesta a «no tengo tiempo»', AYC, 'https://open.spotify.com/episode/5kD92FKCcyPg9DXglfWtu1')
R_FOCO = ref('Seguimiento con foco en el cliente', AYC, 'https://www.youtube.com/watch?v=AtXtBpR-fuI&t=4231')
R_CADENCIA = ref('Cadencia de seguimiento cada veinte días', AYC, 'https://www.youtube.com/watch?v=DShgDzY-iy8&t=5528')


def play(key, kind, stage, title, body, module=None, objection=None, refs=(), when=None, why=OWN, pinned=None, audience='all'):
    return {'key': key, 'module_key': module, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': ['centros-buceo'],
            'personas': [], 'audience': audience, 'about': False, 'pinned': pinned, 'title': title, 'body': body,
            'when_to_use': when, 'why_it_works': why, 'technique_refs': list(refs), 'status': 'official'}


NV = '\n\n_No validada en campo: apunta la objeción literal cada vez que aparezca._'

PLAYS = [
    # ---------------------------------------------------------------- mentalidad
    play('campo-estructura', 'tip', 'mentalidad', 'Es una estructura, no un texto para recitar',
         'Si lo dices palabra por palabra, suenas a robot y el dueño de un centro de buceo lo nota en diez segundos. Aprende el orden y el porqué de cada paso, y dilo con tus palabras.\n\nNo está verificado en campo: sale de lo que pasó en la feria de Brasil, del producto real y de técnicas del Cerebro de Ventas. Las primeras visitas son también para corregirlo: apunta qué funciona y qué no.\n\n**Objetivo de la visita:** salir con el acuerdo firmado **y** el QR puesto con una inmersión creada. Si no se consigue, salir con un siguiente paso con fecha.',
         why=SRC, pinned=5),
    play('campo-corea', 'tip', 'mentalidad', 'Corea y otros mercados: adaptar las frases',
         'Las técnicas vienen de vendedores de España y Latinoamérica. El registro local no está cubierto. La estructura vale; las frases hay que adaptarlas con alguien del país antes de usarlas.', why=SRC),
    # ---------------------------------------------------------------- prospección
    play('campo-antes-de-ir', 'tip', 'prospeccion', 'Antes de ir: diez minutos',
         '- Su web e Instagram: ¿publican inmersiones a diario?, ¿tienen fotos de clientes?\n- Certificadora o certificadoras con las que trabajan.\n- Si organizan viajes de buceo. Si lo hacen, apunta a dónde.\n- Si en su web se puede reservar o pagar. Si no hay botón de pago, apúntalo.\n- De dónde son sus clientes, por las reseñas: locales, turistas nacionales, extranjeros.\n- Un detalle que solo exista en ese centro: un pecio, una especie, un punto de inmersión propio. Lo vas a usar en la apertura y en el mensaje posterior.',
         why=SRC),
    play('campo-cuando-y-como', 'tip', 'prospeccion', 'Cuándo, por qué canal y qué llevar',
         '**Cuándo:** PENDIENTE, no hay dato validado de día u hora. SUPUESTO: fuera de las horas de salida y llegada de barcos, y fuera de la temporada alta de la zona.\n\n**Canal:** presencial. La demo del QR dura medio minuto y se entiende viéndola.\n\n**Qué llevar:** el móvil con la aplicación abierta, un QR de ejemplo y el acuerdo listo para firmar. Nada más.',
         why=SRC),
    play('campo-visita-ligera', 'tip', 'prospeccion', 'Visita ligera',
         'A la primera visita en frío se va sin maletín ni folletos; un vendedor cargado de material pone al cliente a la defensiva. Si piden más información: «Te lo envío por email esta tarde».',
         refs=[R_ENTREVISTA], why=f'Técnica de {AYC}, tal como la recoge el guion de campo v0.'),
    # ---------------------------------------------------------------- primer contacto
    play('campo-apertura', 'script', 'primer_contacto', 'Apertura: treinta segundos',
         'Estructura: situar → decir quién eres → pedir un favor pequeño: una sola pregunta de veinte segundos.\n\n«Hola, soy [nombre], de Oquea. Trabajo con centros de buceo de [zona]. Te pido veinte segundos para una pregunta.»\n\n«De los buceadores que salieron con vosotros esta semana, ¿de cuántos os queda algo más que el nombre en la hoja de salida?»\n\nSea cual sea la respuesta, escucha y apunta. Si la conversación sigue, la segunda pregunta:\n\n«Y si mañana uno de ellos sube una foto de la inmersión a Instagram, ¿aparece en algún sitio que fue con vosotros?»\n\nSi el dueño está con clientes o cargando el barco, no insistas: una sola fecha concreta para volver.',
         refs=[R_APERTURA], pinned=6,
         why=('Estructura de Alfonso y Cristian (apertura de puerta fría presencial). Su guion original desactiva la venta con «no vengo a '
              'venderle absolutamente nada»; en Oquea esa frase no se usa, porque nombrar la venta para negarla planta la idea. La '
              'adaptación y las preguntas son de Oquea, no de los creadores. SUPUESTO, sin validar.')),
    play('campo-primera-visita', 'tip', 'primer_contacto', 'Primero se pregunta, luego se enseña',
         '«En la primera llamada o visita nunca debes intentar vender.» Se va a preguntar y a tomar notas a la vista: «más vale un lápiz corto que una memoria larga».\n\nEn Oquea, con un matiz: como hoy no se cobra nada, la primera visita sí puede terminar en firma. Pero el orden no cambia: primero se pregunta, luego se enseña.',
         refs=[R_ENTREVISTA], why=f'Técnica de {AYC} (frases literales). El matiz es de Oquea.'),
    # ---------------------------------------------------------------- descubrimiento
    play('campo-desc-1', 'discovery', 'descubrimiento', '¿De qué vive más el centro?',
         '«¿De qué vive más el centro: bautizos, cursos, salidas de buceadores certificados, viajes?»', when='Pregunta 1 de 6, en este orden. Toma notas delante de él.', why=OWN + ' Para qué sirve: saber qué le importa. Decide el ángulo.'),
    play('campo-desc-2', 'discovery', 'descubrimiento', '¿De dónde viene la gente que bucea con vosotros?',
         '«¿De dónde viene la gente que bucea con vosotros: de aquí, de otras ciudades, de fuera del país?»', when='Pregunta 2 de 6.', why=OWN + ' Para qué sirve: distingue centro destino de centro emisor.'),
    play('campo-desc-3', 'discovery', 'descubrimiento', '¿Organizáis viajes de buceo?',
         '«¿Organizáis viajes de buceo con vuestros clientes? ¿A dónde habéis ido?»', when='Pregunta 3 de 6.', why=OWN + ' Para qué sirve: abre el ángulo del viaje de club.'),
    play('campo-desc-4', 'discovery', 'descubrimiento', '¿Cómo paga quien reserva?',
         '«Cuando alguien reserva con vosotros, ¿cómo paga?»', when='Pregunta 4 de 6.', why=OWN + ' Para qué sirve: detecta si cobran solo en persona. No se ofrece nada todavía: se apunta.'),
    play('campo-desc-5', 'discovery', 'descubrimiento', '¿Qué os queda de esa persona?',
         '«Después de la inmersión, ¿qué os queda de esa persona?»', when='Pregunta 5 de 6.', why=OWN + ' Para qué sirve: prepara la demo del QR y de la lista de buceadores.'),
    play('campo-desc-6', 'discovery', 'descubrimiento', '¿Quién les dirá que escaneen el QR?',
         '«Si ponemos un QR en el barco, ¿quién sería la persona que les dice a los buceadores que lo escaneen?»', when='Pregunta 6 de 6.', why=OWN + ' Para qué sirve: identifica a quien lo va a ejecutar. Si no hay nadie, el QR no se usará.'),
    play('campo-una-idea', 'tip', 'descubrimiento', 'Una sola idea nueva por visita',
         'Si en el descubrimiento salen tres necesidades, se elige una y las otras se guardan para el seguimiento.', why=SRC),
    # ---------------------------------------------------------------- demo
    play('campo-demo', 'script', 'pitch_demo', 'Lo que se cuenta, y en qué orden',
         'Se enseña, no se explica. Con el móvil en la mano.\n\n1. **El QR.** Escaneas, aparece la inmersión de hoy, la guardas, y el logbook queda relleno con los datos del punto de inmersión. Medio minuto.\n2. **La tarjeta.** Enséñala y señala la línea «with [nombre del centro]».\n3. **La lista de buceadores.**\n4. **El álbum.**\n5. **El mapa y el perfil del centro.** Solo si es un centro destino.\n6. **La red de centros fundadores.** Al final, y según el ángulo.\n\n**Lo que nunca va primero:** la pasarela, la comisión, la red internacional ni nada de lo que está por llegar. Si abres con el futuro, el dueño entiende que hoy no hay nada.',
         module='como-funciona', why=SRC, pinned=7),
    play('campo-tarjeta', 'pitch', 'pitch_demo', 'La tarjeta: sale tu nombre',
         '«Cada vez que uno de tus buceadores comparte esto, sale tu nombre.» Y tu logo: la tarjeta lleva los dos.', module='tu-nombre', when='Mientras señalas la línea «with [nombre del centro]».', why=OWN),
    play('campo-lista', 'pitch', 'pitch_demo', 'La lista: lo que te queda',
         '«Y a ti te queda esto: quién ha buceado contigo y cuántas veces.»', module='tus-buceadores', why=OWN),
    play('campo-album', 'pitch', 'pitch_demo', 'El álbum: treinta días',
         '«Las fotos del día las suben aquí y las ve todo el grupo, durante treinta días.»', module='album', why=OWN),
    # ---------------------------------------------------------------- la red, por ángulo
    play('campo-red-abrir-mercado', 'pitch', 'pitch_demo', 'La red · Abrir mercado',
         '«Estamos firmando con centros de varios países para que los buceadores de unos conozcan a los otros. Los primeros que firman son los centros fundadores.»\n\n**Nunca:** cuántos clientes va a recibir, ni cuándo.',
         module='red-fundadores', when='Recibe o quiere recibir buceadores de fuera. Elige un solo ángulo: no se mezclan.', why=OWN),
    play('campo-red-cobro-online', 'pitch', 'pitch_demo', 'La red · Cobro online',
         '«Estamos preparando que tus clientes puedan reservar y pagar online desde Oquea. Si te interesa, lo dejamos escrito en el acuerdo y eres de los primeros en probarlo.»\n\n**Nunca:** una fecha como compromiso. El porcentaje. Fuera de España: nada de fechas hasta que la revisión legal de pagos esté cerrada.',
         module='red-fundadores', when='Ha dicho que cobra solo en persona. Elige un solo ángulo.', why=OWN),
    play('campo-red-que-vuelvan', 'pitch', 'pitch_demo', 'La red · Que vuelvan',
         '«Hoy tienes la lista y el histórico. Lo que venga después lo construimos con los centros fundadores.»\n\n**Nunca:** que Oquea envía campañas o hace remarketing.',
         module='red-fundadores', when='Le preocupa no saber quién bucea con él. Elige un solo ángulo.', why=OWN),
    play('campo-red-viaje-de-club', 'pitch', 'pitch_demo', 'La red · Viaje de club (SUPUESTO)',
         '«Los centros fundadores de otros países quieren recibir grupos. Si organizas un viaje, puedes hacerlo a un centro de la red.»\n\n**Nunca:** descuentos concretos. No hay ninguno firmado.',
         module='red-fundadores', when='Organiza viajes con sus clientes. SUPUESTO. Elige un solo ángulo.', why=OWN),
    # ---------------------------------------------------------------- condiciones
    play('campo-condiciones', 'monetization', 'negociacion', 'Condiciones: lo que hoy hace las veces de precio',
         'No hay precio. Por eso mismo hay que decir las condiciones completas antes de que pregunte dónde está el truco. Se dice, en este orden:\n\n«Todo lo que has visto hoy no tiene coste.»\n\n«El día que Oquea te lleve una reserva de un cliente nuevo, nos quedamos un 10 % de esa reserva. Si no te llevamos nada, no pagas nada.»\n\n«Más adelante habrá funciones de pago. Te las enseñaremos antes y decidirás si las quieres.»\n\nY después, silencio. Espera a que hable él.\n\n- El 10 % es sobre todo lo generado (Cristian, 6-oct-2026). PENDIENTE: qué cuenta como «cliente nuevo» en cada mercado; hasta que esté cerrado, se lee la cláusula del acuerdo y no se explica de memoria.\n- **En España no se da la cifra:** el porcentaje no está cerrado (en torno al 5 %). Se dice «un porcentaje, en los términos del acuerdo».\n- Quitada «Lo que tienes hoy sigue como está» (Cristian, 6-oct-2026).\n- No se mencionan cifras de futuras suscripciones.',
         module='condiciones', why=OWN, pinned=8),
    play('campo-a-cambio', 'script', 'negociacion', 'A cambio se pide, en voz alta',
         '«Lo que te pido yo: la firma, el QR en el barco y que quien da el briefing lo mencione.»\n\nDilo en voz alta; lo que se cede sin nombrarlo no se valora.', module='condiciones', why=OWN),
    # ---------------------------------------------------------------- cierre
    play('campo-cerrar-o-acordar', 'tip', 'cierre', 'Si no cierra, acuerda',
         '«El vendedor, si no cierra, acuerda. Tu trabajo en venta es cerrar o acordar. Si tú no cerraste o acordaste, te convertiste en un comunicador social, eres un periodista, solamente estás informando.»',
         refs=[R_TREJO], why=f'Técnica de {TREJO}, ley de cerrar o acordar (literal).'),
    play('campo-una-cta', 'tip', 'cierre', 'Una sola llamada a la acción',
         '«Una mente confusa jamás toma acción.» Se pide una cosa, no un menú.', refs=[R_CTA], why=f'Técnica de {AYC} (literal).'),
    play('campo-tres-gestos', 'script', 'cierre', 'El cierre: tres gestos en la misma visita',
         '1. Firma el acuerdo.\n2. Se da de alta el centro y se crea la inmersión de mañana.\n3. El QR queda puesto donde lo ven los buceadores.\n\n**Si no firma hoy:** se acuerda un siguiente paso con día y hora. «Ya hablamos» no es un acuerdo.',
         module='siguiente-paso', why=SRC, pinned=9),
    play('campo-criterio-exito', 'script', 'cierre', 'Criterio de éxito por escrito',
         'Antes de empezar, el cliente define qué tendría que pasar para pasar de la duda al compromiso, se cuantifica y se fija cuándo se revisa, para que no quede en un «ya hablaremos».\n\nPregunta de Oquea: «Dentro de treinta días, ¿cuántas inmersiones registradas con el QR tendrías que ver para decir que esto te sirve?»\n\nApunta su cifra en el acuerdo o en el mensaje posterior, y fija el día de la revisión. Una sola fecha.',
         module='siguiente-paso', refs=[R_CRITERIOS], why=f'Técnica de {AYC} (criterios de éxito antes de la prueba). La pregunta es adaptación de Oquea.'),
    # ---------------------------------------------------------------- objeciones
    play('campo-obj-certificadora', 'objection', 'objeciones', '«Ya uso la aplicación de mi certificadora / otro programa»',
         '«Sigue con ello. Esto es un QR en el barco: no cambia nada de lo que ya usas.»\n\n**Cómo vuelves:** demo del QR.' + NV, objection='ya_tengo_proveedor', why=OWN),
    play('campo-obj-tiempo', 'objection', 'objeciones', '«No tengo tiempo para otra herramienta»',
         '«Lo entiendo. Dame medio minuto y te enseño lo único que tendrías que hacer.»\n\n**Cómo vuelves:** demo, y la pregunta 6 del descubrimiento (quién les dirá que escaneen).' + NV,
         objection='tiempo', refs=[R_TIEMPO],
         why=f'Estructura de {AYC}: validar y pasar a la acción en vez de pedir otra cita. Su frase original habla de generar más ingresos; en Oquea no se promete, por eso se cambia.'),
    play('campo-obj-truco', 'objection', 'objeciones', '«¿Dónde está el truco? ¿Qué gano yo y qué ganáis vosotros?»',
         'Las tres frases de las condiciones, completas: no tiene coste; la comisión solo si Oquea te lleva una reserva de un cliente nuevo (el 10 %; en España, sin cifra: «en los términos del acuerdo»); más adelante habrá funciones de pago y decidirás si las quieres.\n\n**Cómo vuelves:** silencio.' + NV, objection='desconfianza', module='condiciones', why=OWN),
    play('campo-obj-datos', 'objection', 'objeciones', '«¿Los datos de mis clientes de quién son?»',
         '«Tuyos. Tú eres el responsable de los datos de tus clientes y Oquea los trata por tu cuenta. Puedes verlos y exportarlos.»\n\nHECHO: decisión de producto para España y la Unión Europea. PENDIENTE: confirmar que el contrato de encargo de tratamiento está disponible para firmar, y la normativa aplicable en Corea y Latinoamérica.\n\n**Cómo vuelves:** la lista de buceadores.' + NV,
         objection='desconfianza', module='tus-buceadores', why=OWN),
    play('campo-obj-cuantos-clientes', 'objection', 'objeciones', '«¿Cuántos clientes me vais a traer?»',
         '«Ese número todavía no existe; la red está empezando. Lo que sí tienes desde hoy: tu centro en el mapa y tu nombre en cada inmersión que compartan.»\n\n**Cómo vuelves:** la tarjeta.' + NV, objection='desconfianza', module='tu-nombre', why=OWN),
    play('campo-obj-quien-mas', 'objection', 'objeciones', '«¿Quién más lo usa?»',
         '«Estamos empezando, por eso buscamos centros fundadores. Ya han firmado operadores de Galápagos y Brasil.»\n\nNo se dan nombres sin permiso escrito ni cifras de uso.\n\n**Cómo vuelves:** la red, según el ángulo.' + NV, objection='desconfianza', module='red-fundadores', why=OWN),
    play('campo-obj-cobro-ya', 'objection', 'objeciones', '«Quiero el cobro online ya»',
         '«Está en preparación. Lo dejamos escrito en el acuerdo y eres de los primeros.» Sin fecha comprometida.\n\n**Cómo vuelves:** la firma.' + NV, module='en-preparacion', why=OWN),
    play('campo-obj-socio', 'objection', 'objeciones', '«Lo tengo que hablar con mi socio»',
         'No se deja la decisión en una conversación en la que no estás. Se propone una reunión conjunta con fecha concreta y con un objetivo definido, y se cierra con «¿de acuerdo?».\n\n**Cómo vuelves:** la fecha.' + NV,
         objection='no_decido_yo', refs=[R_TREJO], why=f'Técnica de {TREJO}: el que no cierra, acuerda.'),
    play('campo-obj-temporada', 'objection', 'objeciones', '«Ahora en temporada no puedo»',
         '«Justo ahora es cuando más inmersiones haces. Poner el QR son cinco minutos; lo dejo hecho yo.» SUPUESTO.\n\n**Cómo vuelves:** el cierre.' + NV, objection='tiempo', why=OWN),
    play('campo-obj-emisor-viajes', 'tip', 'objeciones', 'La que no sabemos contestar todavía',
         '«Si luego vendéis viajes a mis clientes, ¿qué gano yo?» (centro emisor).\n\nPENDIENTE de decisión de empresa. Mientras tanto: se apunta, no se improvisa.', why=SRC),
    # ---------------------------------------------------------------- seguimiento
    play('campo-mensajes-reglas', 'tip', 'seguimiento', 'Antes de enviar un mensaje: dos pruebas',
         'Si el mensaje vale para otro centro cambiando solo el nombre, no está terminado; y todo lo que diga que hiciste tiene que ser verdad.\n\nEntre corchetes va lo que solo existe en esa cuenta. Si no lo tienes, no envíes la plantilla.', why=SRC),
    play('campo-msg-con-firma', 'script', 'seguimiento', 'Mensaje: el mismo día, con firma',
         'Hola [nombre], soy [comercial] de Oquea. Ya está [centro] dado de alta y la salida de mañana a [punto de inmersión] creada. El QR lo dejamos en [dónde]. Quedamos en revisar el [fecha] si habéis llegado a las [N] inmersiones registradas. Cualquier cosa con el QR, a este número.', why=OWN),
    play('campo-msg-sin-firma', 'script', 'seguimiento', 'Mensaje: el mismo día, sin firma',
         'Hola [nombre], soy [comercial] de Oquea. Te mando el acuerdo que vimos. Me apunté lo que comentaste de [detalle concreto de la conversación]. Paso el [fecha] a las [hora] y lo dejamos puesto.', why=OWN),
    play('campo-msg-seguimiento', 'script', 'seguimiento', 'Mensaje: seguimiento a un centro que ya firmó',
         'Un mensaje de «estoy atento» no da ninguna razón para responder: cada contacto lleva algo nuevo. Y no se habla de tus novedades: se lleva información útil para su negocio.\n\nHola [nombre]. Esta semana se han registrado [N] inmersiones con vuestro QR; [buceador o dato concreto, si procede y con su permiso]. Cómo lo veis desde el barco, lo están escaneando sin que se lo recordéis?\n\nSolo con datos reales de ese centro. Si el dato es cero, el mensaje es otro: preguntar qué ha pasado con el QR y proponer una fecha para pasar.',
         refs=[R_TREJO, R_FOCO], why=f'Técnicas de {TREJO} (seguimiento con valor nuevo) y {AYC} (seguimiento con foco en el cliente). La plantilla es de Oquea.'),
    play('campo-cadencia', 'tip', 'seguimiento', 'Un contacto cada veinte días',
         'Un contacto cada veinte días aproximadamente a cada centro firmante, hasta que lo que espera esté disponible. Sin esto, la firma caduca sola.',
         refs=[R_CADENCIA], why=f'Técnica de {AYC}: seguimiento cada veinte días.'),
    play('campo-que-apuntar', 'tip', 'seguimiento', 'Qué apuntar después de cada visita',
         'Este guion se corrige con lo que traigas:\n\n1. La objeción literal que más pesó.\n2. Qué parte de la demo le hizo reaccionar.\n3. Quién decidió y quién va a decir «escanead el QR».\n4. Si firmó: su cifra de éxito a treinta días y la fecha de revisión.\n5. Día y hora en que te atendió bien.', why=SRC),
]

keys = {p['key'] for p in PLAYS}
t['playbook'] = [p for p in t.get('playbook', []) if p['key'] not in keys] + PLAYS
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea guion:', len(PLAYS), 'jugadas ·', len(t['playbook']), 'en total')
