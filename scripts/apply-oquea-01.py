#!/usr/bin/env python3
"""
Aplica a tenants/oquea/tenant.json el documento 01 «Empresa, producto y modelo de negocio» (v0, 6-oct-2026,
docs/ventas/oquea/fuentes/01-empresa.md). Va después de apply-oquea-03.py (guía) y antes de apply-oquea-05.py
(catálogo). Idempotente.

Manda sobre lo cargado desde la guía y la web: la lista cerrada de la sección 2 es lo único que se enseña.
- Sector «Centros de buceo»: qué es, quién decide y quién lo ejecuta, situaciones destino/emisor, aviso.
- Actores (dueño o instructor jefe; quien está en el barco), marcados como SUPUESTO.
- Situaciones para comparar ventas: destino/emisor y mercado.
- Jugadas: qué es Oquea, qué vende hoy el comercial, qué recibe y qué pide, cómo se describe la lista, qué no existe,
  lo que no se dice nunca, y lo interno (previsiones, modelo, situación real, condiciones del comercial) solo para el
  equipo.
- Retira las jugadas de la guía que chocan con el 01 (fidelización, «con tu logo», la frase de la web).

    python3 scripts/apply-oquea-01.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
SRC = 'Documento 01 · Empresa, producto y modelo de negocio (v0, 6-oct-2026).'

# ---------------------------------------------------------------- 1. sector
seg = next(s for s in t['market'] if s['key'] == 'centros-buceo')
seg.update({
    'description': 'Centros de buceo que crean sus inmersiones y quieren saber quién bucea con ellos. Un mismo centro puede ser destino (recibe buceadores de fuera) y emisor (sus buceadores viajan).',
    'value_prop': ('El buceador escanea el QR del centro y la inmersión se guarda en su logbook digital ya rellena. '
                   'El centro obtiene la lista de los buceadores que han pasado por él, con su histórico.'),
    'icp': ('Centro destino: quiere recibir buceadores de otros países (Latinoamérica, validado en la feria de Brasil; Corea, '
            'SUPUESTO). Centro emisor: tiene buceadores locales que viajan (España, SUPUESTO; aún no se le ha planteado a nadie).'),
    'disqualifiers': None,
    'buying_process': ('Decide el dueño o el instructor jefe (SUPUESTO del sector). Lo ejecuta la persona que está en el barco y dice '
                       '«escanead el QR»: si le supone trabajo extra, el QR no se usa (SUPUESTO).'),
    'deal_size': 'Sin coste: acuerdo de centro fundador. Comisión del 10 % solo sobre clientes nuevos que lleve Oquea, en los términos del acuerdo.',
    'sales_cycle': 'Una visita: acuerdo firmado y QR puesto con una inmersión creada. Si no, un siguiente paso con fecha.',
    'notice': ('Oquea no tiene todavía clientes de pago ni datos de uso: no hay casos, cifras ni testimonios que citar. '
               'Solo se enseña la lista cerrada del producto. El objetivo de la visita: acuerdo firmado y QR puesto.'),
})
seg['personas'] = [
    {'key': 'dueno-centro', 'name': 'Dueño o instructor jefe', 'role': 'decisor',
     'goals': 'Abrir mercado internacional (centro destino). PENDIENTE en el centro emisor.',
     'pains': None, 'kpis': None, 'objections': ['desconfianza', 'tiempo', 'ya_tengo_proveedor'],
     'how_to_approach': 'En persona, con el móvil en la mano: primero se pregunta, luego se enseña. SUPUESTO general del sector, sin validar por cuenta.',
     'avoid': 'Abrir con lo que está por llegar (pasarela, red internacional): entiende que hoy no hay nada.',
     'can_help': 'Firma el acuerdo de centro fundador.', 'can_block': 'No firma o firma y no pone el QR.', 'angles': []},
    {'key': 'quien-esta-en-el-barco', 'name': 'Quien está en el barco', 'role': 'usuario',
     'goals': None, 'pains': None, 'kpis': None, 'objections': ['tiempo'],
     'how_to_approach': 'Pregunta en el descubrimiento quién dirá «escanead el QR» y enséñale lo único que tiene que hacer. SUPUESTO por validar en campo.',
     'avoid': 'Que le suponga trabajo extra.', 'can_help': 'Lo menciona en el briefing y el QR se usa.',
     'can_block': 'Si le supone trabajo extra, el QR no se usa.', 'angles': []},
]

# ---------------------------------------------------------------- 2. situaciones
FACETS = [
    {'key': 'situacion-centro', 'label': 'Situación del centro', 'question': '¿Recibe buceadores de fuera o sus buceadores viajan?',
     'icon': 'globe', 'scope': 'account', 'multi': True, 'weight': 4, 'options': [
         {'key': 'destino', 'label': 'Centro destino', 'hint': 'Quiere recibir buceadores de otros países.'},
         {'key': 'emisor', 'label': 'Centro emisor', 'hint': 'Tiene buceadores locales que viajan. SUPUESTO.'},
     ]},
    {'key': 'mercado', 'label': 'Mercado', 'question': '¿En qué mercado está el centro?', 'icon': 'map-pin', 'scope': 'account',
     'multi': False, 'weight': 3, 'options': [
         {'key': 'espana', 'label': 'España'}, {'key': 'latam', 'label': 'Latinoamérica'}, {'key': 'corea', 'label': 'Corea'},
         {'key': 'otro', 'label': 'Otro'},
     ]},
]
fk = {f['key'] for f in FACETS}
t['facets'] = [f for f in t.get('facets', []) if f.get('key') not in fk] + FACETS


# ---------------------------------------------------------------- 3. jugadas
def play(key, kind, title, body, stage=None, module=None, about=False, pinned=None, audience='all', when=None, why=SRC, segments=('centros-buceo',), objection=None):
    return {'key': key, 'module_key': module, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': list(segments),
            'personas': [], 'audience': audience, 'about': about, 'pinned': pinned, 'title': title, 'body': body,
            'when_to_use': when, 'why_it_works': why, 'technique_refs': [], 'status': 'official'}


PLAYS = [
    play('oquea-en-una-frase', 'pitch', 'Oquea en una frase',
         'Oquea es una plataforma para buceadores y centros de buceo. El buceador escanea el QR del centro y la inmersión se guarda en su logbook digital ya rellena. El centro obtiene la lista de los buceadores que han pasado por él, con su histórico.',
         stage='pitch_demo', pinned=1, segments=()),
    play('objetivo-visita', 'tip', 'Qué vende hoy el comercial',
         'Hoy no se vende una suscripción. En la misma visita se consiguen dos cosas:\n\n1. El acuerdo de centro fundador firmado.\n2. El QR puesto y funcionando, con al menos una inmersión creada.\n\nUna firma sin QR en uso no cuenta como resultado. Un centro que firma y no usa Oquea se enfría, y a seis semanas vista no recuerda qué firmó.',
         stage='mentalidad', pinned=2),
    play('que-recibe-el-centro', 'pitch', 'Qué recibe el centro hoy',
         '- Todo lo de la lista cerrada del producto, sin coste.\n- Su nombre en cada tarjeta que sus buceadores comparten.\n- La lista de quién ha buceado con él.\n- Su perfil en el mapa de Oquea.\n- La condición de centro fundador de la red internacional.',
         stage='negociacion'),
    play('que-pide-oquea', 'monetization', 'Qué pide Oquea a cambio',
         '- La firma del acuerdo.\n- El QR visible en el barco o en el local, y que el equipo lo mencione en el briefing.\n- PROPUESTA: un criterio de éxito a 30 días, escrito en el momento de la firma: número de inmersiones registradas con el QR. La cifra la fija cada centro con el comercial según su volumen.\n- Si el centro quiere la pasarela: que lo deje por escrito («cuando esté disponible, la usaremos»).',
         stage='negociacion'),
    play('como-se-describe-la-lista', 'tip', 'Cómo se describe la lista de buceadores',
         '«La lista de quién ha buceado contigo y cuántas veces.»\n\nNo se le llama remarketing ni fidelización automática: hoy el centro la consulta y contacta él mismo.',
         stage='pitch_demo'),
    play('lo-que-no-existe', 'tip', 'Lo que no existe hoy (no se vende)',
         'Ninguno de estos puntos se presenta como disponible, ni como «próximamente», salvo compromiso con fecha y por escrito en el acuerdo:\n\n- Reservas online.\n- Pasarela de pago o enlaces de pago.\n- Trips (viajes) y cursos como productos propios.\n- Campañas de email, descuentos automáticos o cualquier automatización sobre la lista de buceadores.\n- Integración con WhatsApp.\n- Descuentos cruzados entre centros. La asociación existe en la aplicación pero no hace nada.\n- Facturación.\n- Lectura de ordenadores de buceo.\n- Eventos creados por centros que no sean ONG.',
         stage='mentalidad', pinned=4, segments=()),
    play('no-se-dice', 'tip', 'Lo que no se dice nunca',
         '- Que Oquea trae clientes, o cuántos. Se explica el mecanismo: perfil en el mapa, red de centros y, cuando existan, reservas.\n- Un porcentaje de descuento entre centros. No hay ninguno firmado.\n- Una fecha de pasarela, reservas o trips como compromiso.\n- Que la lista de buceadores hace remarketing, campañas o algo «automático».\n- Cifras de uso, de centros activos o de buceadores. No existen.\n- El precio de futuras suscripciones.\n- Que Oquea es «el mejor» o «el más adaptado» del mercado. Se dice qué hace, y se enseña.\n- El nombre de un centro firmante sin su permiso por escrito.\n- «Cooperativa».\n- Cualquier función que no esté en la lista cerrada del producto.',
         stage='mentalidad', pinned=3, segments=(),
         why=SRC + ' Sección 10, y sección 9 del guion de campo v0.'),
    play('sin-casos', 'tip', 'No hay casos ni cifras que citar',
         'Oquea no tiene todavía clientes de pago ni datos de uso: no hay casos de éxito, cifras ni testimonios. No se inventan.\n\nLos centros firmantes solo se nombran con su permiso por escrito; por defecto, versión anónima: «operadores de Galápagos y Brasil».',
         stage='mentalidad', segments=()),
    play('perfiles-oquea', 'fit', 'Tres perfiles: buceador, centro y ONG',
         'Hay tres tipos de perfil: buceador, centro de buceo y ONG. Una misma persona puede gestionar uno o varios centros y tener además su perfil de buceador.',
         stage='pitch_demo', segments=()),
    play('destino-o-emisor', 'fit', 'Centro destino o centro emisor',
         'No son segmentos de tamaño: un mismo centro puede ser las dos cosas.\n\n- **Centro destino**: quiere recibir buceadores de otros países. Latinoamérica (validado), Corea (SUPUESTO). Le mueve abrir mercado internacional. En la feria de Brasil fue la primera necesidad que expresaron los centros; muchos pueden montar el paquete completo salvo el vuelo: recogida, alojamiento, buceo.\n- **Centro emisor**: tiene buceadores locales que viajan. España (SUPUESTO). Qué le mueve: PENDIENTE (hipótesis: organizar los viajes de su club a destinos de la red con condiciones ya negociadas). A los centros de España aún no se les ha planteado.',
         stage='descubrimiento'),
    play('quien-decide', 'fit', 'Quién decide y quién lo ejecuta',
         'Decide habitualmente el dueño o el instructor jefe (SUPUESTO general del sector, sin validar por cuenta).\n\nLo ejecuta la persona que está en el barco y dice «escanead el QR». Si a esa persona le supone trabajo extra, el QR no se usa (SUPUESTO por validar en campo).',
         stage='descubrimiento'),
    # --- solo equipo interno
    play('modelo-de-negocio', 'tip', 'Cómo gana dinero Oquea',
         'Hoy ningún centro paga por Oquea. El alta, el QR, el logbook y la lista de buceadores son gratuitos. Nada de lo que sigue se ha cobrado todavía.\n\n- Comisión por clientes nuevos: 10 %. Aceptado de palabra en la feria de Brasil y recogido en los acuerdos firmados. Base exacta del cálculo PENDIENTE. No cobrado.\n- Comisión dentro de la red: en torno al 2 %, cifra no cerrada. SUPUESTO, sin funcionalidad.\n- Pasarela de pago: porcentaje PENDIENTE. Interés declarado; no existe todavía.\n- Suscripción de fidelización: cuota PENDIENTE. Idea, después de la fase gratuita.\n- Suscripción de facturación: 100–200 €/mes en España, adaptado por país. Idea. No se menciona.\n\nOrden estratégico: (1) acuerdos firmados y QR puesto en el mayor número de centros, en España, Latinoamérica y Corea; (2) con pasarela y trips, transacciones entre centros de la red; (3) con uso real, suscripción de fidelización; (4) facturación en 2027. La prioridad declarada ahora es generar ingresos reales cuanto antes.',
         stage='mentalidad', about=True, audience='team', segments=()),
    play('previsiones-internas', 'tip', 'Previsiones internas (no se venden)',
         'Estimaciones del equipo de producto. No son compromisos:\n\n- Reservas sobre un slot con enlace de pago (pasarela): finales de noviembre de 2026.\n- Mejoras de la lista de buceadores: noviembre de 2026 (alcance PENDIENTE).\n- Eventos creables por cualquier centro: noviembre de 2026.\n- Trips: diciembre de 2026 – enero de 2027. Prioritarios porque desbloquean la red internacional.\n- Suscripción de fidelización: sin fecha.\n- Facturación: primer o segundo trimestre de 2027.\n- Cursos como producto propio: sin fecha.\n- Integración con un CRM de WhatsApp de terceros: idea, sin decidir.\n\nA los centros que ya han firmado se les dijo que la parte internacional «a lo mejor llegaba para diciembre».\n\nPROPUESTA de comunicación: si un cliente pregunta por fechas, se da siempre la fecha tardía del rango y se presenta como previsión. Pagos internacionales: pendientes de revisión legal; fuera de España no se da fecha hasta que esté cerrada.',
         stage='objeciones', audience='team', segments=()),
    play('situacion-real', 'tip', 'Situación comercial real (6 de octubre de 2026)',
         '- Cero clientes de pago.\n- Acuerdos firmados en Latinoamérica (Galápagos, Brasil y otros): 5, cifra por verificar. 3 han dicho que quieren usar la pasarela.\n- Unos 12 centros en España han dicho que empezarán a usar el QR cuando salga la versión mejorada. Ninguno lo está usando todavía.\n- Ningún dato de uso: ni inmersiones registradas, ni escaneos.\n- A ningún centro de España se le ha hablado todavía de la red internacional.\n- Ningún descuento cruzado ni acuerdo entre centros firmado.',
         stage='mentalidad', audience='team', segments=()),
    play('acuerdo-hoy', 'tip', 'Qué es lo firmado hasta ahora',
         'Cartas de intención sin compromiso económico: comisión del 10 % sobre clientes nuevos europeos y permiso de exposición a la red de centros.\n\nTexto literal del acuerdo: PENDIENTE. Hasta que esté cargado, no se describen cláusulas de memoria. Versiones para España y Corea (qué es «cliente nuevo» en cada mercado): PENDIENTE.\n\nNombre de la red: provisional, «red de centros fundadores». Nunca «cooperativa»: es una figura jurídica concreta y no es lo que se firma.',
         stage='negociacion', audience='team'),
    play('condiciones-del-comercial', 'tip', 'Condiciones del comercial',
         'Intención declarada: el comercial que consiga un centro que use la pasarela se queda la mayor parte del porcentaje de Oquea durante al menos un año. Se ha mencionado el 70 % como ejemplo, no como cifra cerrada.\n\nPENDIENTE, y se cierra por escrito antes de salir a campo: porcentaje definitivo; base de cálculo (margen neto de Oquea después del proveedor de pagos, no el bruto); qué lo devenga (volumen procesado, no la firma); desde cuándo cuenta el año; qué se cobra por un acuerdo con QR en uso pero sin pasarela; quién lleva la cuenta si el comercial deja de estar; contrato de colaboración por país.',
         stage='mentalidad', audience='team', segments=()),
]

# Lo que la guía cargó y el 01 corrige: fuera.
RETIRE = ['fideliza', 'escanean-tu-ves']
keys = {p['key'] for p in PLAYS}
t['playbook'] = [p for p in t.get('playbook', []) if p['key'] not in keys and p['key'] not in RETIRE] + PLAYS
t['retired_plays'] = sorted(set(t.get('retired_plays', [])) | set(RETIRE))

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea 01:', len(seg['personas']), 'actores ·', len(FACETS), 'situaciones ·', len(PLAYS), 'jugadas ·', len(RETIRE), 'retiradas')
