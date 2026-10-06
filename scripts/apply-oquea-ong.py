#!/usr/bin/env python3
"""
Tipo de cliente «ONG» en tenants/oquea/tenant.json, con lo que contó Cristian el 6-oct-2026 (no hay documento todavía:
docs/ventas/oquea/fuentes/ong-cristian-06-10.md recoge sus palabras). Va después de apply-oquea-03b.py. Idempotente.

- Qué gana la ONG: su evento con varios centros a la vez; la gente se apunta desde el mapa en el centro más cercano;
  cada asistente recibe una insignia de asistencia en la aplicación; la ONG tiene a todos los participantes de todos
  los centros; está en el mapa. Todo gratis.
- Qué da la ONG: acceso a sus centros de buceo, que usan Oquea en sus eventos.
- Remarketing: «serán los primeros». Se cuenta como lo que viene, sin fechas (el 01 dice que hoy la lista no envía
  campañas): PENDIENTE confirmar qué existe hoy.
Los textos son míos a partir de lo que dijo Cristian: van en docs/ventas/oquea/agente/ONG-CARGADO.md para revisarlos.

    python3 scripts/apply-oquea-ong.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
PHOTO = 'asset:img/fotos/share-card-bg.webp'
SRC = 'Cristian, 6-oct-2026 (de palabra; sin documento). Texto redactado por la sesión: revisar.'


def mod(key, name, description, **props):
    props.setdefault('photo', PHOTO)
    return {'key': key, 'block_type': 'app-steps', 'name': name, 'is_catalog': True, 'default_price': None,
            'currency': 'EUR', 'description': description, 'props': props}


CATALOG = [
    mod('ong-portada', 'ONG · Portada', 'Portada para una ONG.',
        tone='dark', eyebrow='Oquea para ONGs', title='{company}: tu evento, en todos tus centros a la vez', highlight='{company}',
        mark='asset:isotipo-blanco.svg'),
    mod('ong-eventos', 'ONG · El evento', 'El evento con varios centros y la inscripción desde el mapa.',
        title='Tu evento, con varios centros a la vez', highlight='varios centros',
        lede='Creas el evento en Oquea, como una limpieza, y participan tus centros de buceo a la vez. La gente se inscribe desde el mapa en el centro más cercano, y cada centro ve quién va a venir.',
        screens=[{'screen': 'event'}]),
    mod('ong-insignia', 'ONG · Insignia de asistencia', 'La insignia que recibe cada persona que asiste.',
        title='Cada asistente se lleva su insignia', highlight='su insignia',
        lede='Quien asiste a tu evento recibe en Oquea una insignia que dice que ha participado. Se queda en su perfil.',
        screens=[{'screen': 'badge'}]),
    mod('ong-participantes', 'ONG · Participantes', 'Todos los que han participado, de todos los centros.',
        title='Todos tus participantes, en una lista', highlight='en una lista',
        lede='Tienes a todas las personas que han participado en tus eventos, en todos los centros.',
        cards=[{'icon': 'sparkle', 'title': 'Seréis los primeros en las herramientas de remarketing.', 'body': 'Para volver a contactar con quien ha participado. Se avisará a las ONGs cuando estén.'}],
        screens=[{'screen': 'crm-list'}]),
    mod('ong-mapa', 'ONG · El mapa', 'La ONG en el mapa para que la gente se apunte antes.',
        title='En el mapa, para llegar a más gente', highlight='el mapa',
        lede='Tu ONG y tus eventos aparecen en el mapa de Oquea, junto a los centros y los puntos de inmersión, para que la gente se apunte más rápido.',
        screens=[{'screen': 'map'}]),
    mod('ong-condiciones', 'ONG · Condiciones', 'Qué da la ONG y qué recibe, sin coste.',
        title='Condiciones',
        cards=[
            {'icon': 'check', 'title': 'Sin coste.', 'body': 'Los eventos, las insignias, la lista de participantes y tu lugar en el mapa no tienen coste.'},
            {'icon': 'sparkle', 'title': 'Los primeros.', 'body': 'Seréis los primeros en las herramientas de remarketing cuando lleguen.'},
            {'icon': 'send', 'title': 'Lo que pedimos.', 'body': 'Que tus centros de buceo usen Oquea en tus eventos.'},
        ]),
    mod('ong-siguiente-paso', 'ONG · Siguiente paso', 'Los pasos para empezar.',
        tone='dark', title='Siguiente paso', mark='asset:isotipo-blanco.svg',
        cards=[
            {'icon': 'send', 'title': '1. Firmamos el acuerdo.'},
            {'icon': 'users', 'title': '2. Damos de alta tus centros de buceo.'},
            {'icon': 'calendar', 'title': '3. Creamos tu primer evento.'},
        ]),
]
keys = {m['key'] for m in CATALOG}
t['catalog'] = [m for m in t['catalog'] if m['key'] not in keys] + CATALOG

B = {m['key']: {'module': m['key'], 'props': {}} for m in CATALOG}
for k in ['ong-eventos', 'ong-insignia', 'ong-participantes', 'ong-mapa']:
    B[f'{k}-v'] = {'module': k, 'props': {'lede': '', 'cards': []}}
SEG = {
    'key': 'ong', 'name': 'ONGs', 'icon': 'heart', 'image': PHOTO,
    'description': 'ONGs que organizan eventos con centros de buceo, como limpiezas de fondos.',
    'value_prop': 'Su evento en todos sus centros a la vez: la gente se apunta desde el mapa en el centro más cercano, cada asistente se lleva su insignia y la ONG tiene a todos los participantes. Sin coste.',
    'icp': 'ONG con varios centros de buceo colaboradores que organiza eventos (limpiezas u otras acciones).',
    'disqualifiers': None,
    'buying_process': 'Decide la ONG. Los centros colaboradores son los que usan Oquea el día del evento.',
    'deal_size': 'Sin coste. A cambio, la ONG da acceso a sus centros de buceo, que usan Oquea en sus eventos.',
    'sales_cycle': None,
    'notice': 'Tipo de cliente nuevo, contado de palabra por Cristian (6-oct-2026): sin documento ni ventas todavía. El remarketing es lo que viene: sin fechas.',
    'modules': [
        {'module_key': 'ong-eventos', 'priority': 1, 'fit': 'El evento con varios centros a la vez.'},
        {'module_key': 'ong-participantes', 'priority': 1, 'fit': 'Todos los participantes, de todos los centros.'},
        {'module_key': 'ong-insignia', 'priority': 2, 'fit': 'Lo que se lleva cada asistente.'},
        {'module_key': 'ong-mapa', 'priority': 2, 'fit': 'Para que la gente se apunte antes.'},
    ],
    'personas': [
        {'key': 'responsable-ong', 'name': 'Responsable de la ONG', 'role': 'decisor', 'goals': 'Llegar a más gente en sus eventos.',
         'pains': None, 'kpis': None, 'objections': [], 'how_to_approach': None, 'avoid': 'Prometer fechas del remarketing.',
         'can_help': 'Trae a todos sus centros de buceo.', 'can_block': None, 'angles': []},
        {'key': 'centro-colaborador', 'name': 'Centro colaborador de la ONG', 'role': 'usuario', 'goals': None, 'pains': None, 'kpis': None,
         'objections': ['tiempo'], 'how_to_approach': 'Es un centro de buceo: lo de los centros vale para él.', 'avoid': None,
         'can_help': 'Usa Oquea el día del evento.', 'can_block': 'Si no lo usa, el evento no queda en Oquea.', 'angles': []},
    ],
    'proposal': {
        'blocks': B,
        'modes': {
            'full': ['ong-portada', 'ong-eventos', 'ong-participantes', 'ong-insignia', 'ong-mapa', 'ong-condiciones', 'ong-siguiente-paso'],
            'visual': ['ong-portada', 'ong-eventos-v', 'ong-participantes-v', 'ong-insignia-v', 'ong-condiciones', 'ong-siguiente-paso'],
        },
        'max': {'full': 7, 'visual': 6},
        'priority': ['ong-portada', 'ong-eventos', 'ong-eventos-v', 'ong-condiciones', 'ong-siguiente-paso', 'ong-participantes',
                     'ong-participantes-v', 'ong-insignia', 'ong-insignia-v', 'ong-mapa', 'ong-mapa-v'],
    },
}
t['market'] = [s for s in t['market'] if s['key'] != 'ong'] + [SEG]


def play(key, kind, stage, title, body, module=None, audience='all'):
    return {'key': key, 'module_key': module, 'kind': kind, 'stage': stage, 'objection': None, 'segments': ['ong'], 'personas': [],
            'audience': audience, 'about': False, 'pinned': None, 'title': title, 'body': body, 'when_to_use': None,
            'why_it_works': SRC, 'technique_refs': [], 'status': 'official'}


PLAYS = [
    play('ong-pitch', 'pitch', 'pitch_demo', 'Oquea para una ONG',
         'Tu evento en todos tus centros a la vez. La gente se apunta desde el mapa en el centro más cercano, cada asistente se lleva su insignia en la aplicación y tú tienes a todos los que han participado. Sin coste.',
         module='ong-eventos'),
    play('ong-acuerdo', 'monetization', 'negociacion', 'El acuerdo con una ONG',
         'La ONG nos da acceso a todos sus centros de buceo, que usarán Oquea cuando hagan sus eventos.\n\nA cambio, todo gratis:\n- La lista de quién ha participado, en todos los centros.\n- Serán los primeros en el remarketing.\n- Su ONG en el mapa, para que la gente se apunte más rápido y llegar a más gente.',
         module='ong-condiciones'),
    play('ong-remarketing', 'tip', 'mentalidad', 'Remarketing: lo que viene, sin fechas',
         'A las ONGs se les dice que serán las primeras en el remarketing. No se da fecha ni se dice que hoy envía campañas: el documento de producto dice que hoy la lista no hace remarketing. PENDIENTE confirmar qué existe hoy para las ONGs.',
         audience='team'),
]
pk = {p['key'] for p in PLAYS}
t['playbook'] = [p for p in t['playbook'] if p['key'] not in pk] + PLAYS
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('oquea ONG:', len(CATALOG), 'módulos ·', len(PLAYS), 'jugadas')
