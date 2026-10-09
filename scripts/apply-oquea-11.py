#!/usr/bin/env python3
"""
Bienvenida y «Así funciona» de Oquea, rehechos con lo que pidió Cristian (9-oct-2026) al verlos:
- Decir primero QUÉ es Oquea: la comunidad del buceo, «una especie de Strava para buceadores» que conecta el buceo a
  nivel internacional, y una herramienta de gestión para el centro (la jugada «Oquea en una frase», que la bienvenida
  enseña como «Qué es Oquea»).
- El recorrido: primero la comunidad (mapa, tarjetas para compartir, modo Strava); después cómo funciona, muy sencillo:
  el panel del centro antes que el móvil, el QR escaneado, el logbook, el CRM para que vuelvan. Y el modelo (el 10 %
  cuando Oquea le lleva un cliente: dato para el comercial; con el centro, el guion de siempre).
- Nombres de los módulos pensados para el comercial (no «Tu nombre en cada inmersión», que le habla al centro).
- La consola del centro entra en el catálogo (así el recorrido la enseña con su UI).
- Fotos de fondo nuevas y distintas: recortes de las fotos de las tarjetas exportadas de Cristian, sin el texto
  (assets/img/fondos/); cada sector con la suya.
Idempotente.

    python3 scripts/apply-oquea-11.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/oquea/tenant.json'
t = json.loads(P.read_text())
F = 'asset:img/fondos/'

# 1. Qué es Oquea (palabras de Cristian)
pitch = next(p for p in t['playbook'] if p.get('key') == 'oquea-en-una-frase')
pitch['title'] = 'Qué es Oquea'
pitch['body'] = (
    'Oquea es la comunidad del buceo: una especie de Strava para buceadores que conecta el mundo del buceo a nivel '
    'internacional. El buceador guarda cada inmersión en su logbook y la comparte. El centro de buceo tiene una '
    'herramienta para gestionar sus actividades y sus clientes, y aparece en el mapa para buceadores de todo el mundo.'
)
pitch['why_it_works'] = 'Cristian, 9-oct-2026 (al revisar la bienvenida). Antes: documento 01 · Empresa, producto y modelo de negocio (v0, 6-oct-2026).'

# 2. El recorrido: primero la comunidad, después cómo funciona
t['tour'] = [
    {'title': 'El mapa del buceo, en todo el mundo',
     'body': 'Puntos de inmersión, centros, ONGs y sus eventos, en un mapa. Un buceador que viaja (de Corea a España, '
             'o al revés) descubre ahí dónde bucear y con quién. Pronto, se apuntará a las actividades desde el mapa.',
     'image': F + 'rayos-peces.webp', 'ui': 'app:map'},
    {'title': 'Cada inmersión, una tarjeta para compartir',
     'body': 'El buceador comparte su inmersión en Instagram con una tarjeta: profundidad, tiempo, lo que vio y el '
             'nombre del centro. Para el centro es publicidad gratis, cada vez.',
     'image': 'asset:img/exportables/1-inmersion.webp', 'ui': 'app:share-card'},
    {'title': 'Modo Strava: su vida de buceador',
     'body': 'Todas sus inmersiones en un logbook digital, con su perfil, sus récords y sus fotos. Lo enseña, lo '
             'comparte y vuelve a mirarlo. Por eso los buceadores se quedan.',
     'image': F + 'pareja-arrecife.webp', 'ui': 'app:logbook'},
    {'title': 'El centro lo gestiona desde su panel',
     'body': 'Las actividades del día, quién viene a cada una, su equipo y sus clientes. Desde el ordenador del centro.',
     'image': 'asset:img/producto/web/01-panel-centro-actividades.png', 'ui': 'console:today'},
    {'title': 'El buceador escanea el QR',
     'body': 'Al volver de bucear, escanea el QR del centro y elige la actividad de hoy. Sin papeles ni formularios.',
     'image': 'asset:img/producto/web/02-registro-qr-logbook.png', 'ui': 'app:qr-scan'},
    {'title': 'Y la inmersión queda en su logbook',
     'body': 'Con los datos del punto de inmersión ya rellenos: profundidad, temperatura, vida marina. Sin escribir nada.',
     'image': 'asset:img/producto/app/22-inmersion-guardada-es.png', 'ui': 'app:dive-saved'},
    {'title': 'Un CRM para que vuelvan',
     'body': 'Cada buceador que escanea entra en el CRM del centro: quién es, cuántas veces ha venido, qué ha hecho y '
             'cuándo fue la última. El centro sabe a quién llamar para que vuelva y cuida a sus clientes.',
     'image': 'asset:img/producto/web/04-crm-perfil-buceador.png', 'ui': 'console:crm'},
    {'title': 'Gratis para el centro; Oquea gana si le trae clientes',
     'body': 'Hoy el centro no paga nada. El modelo: cuando Oquea le lleva un cliente, Oquea se queda un 10 %. Es para '
             'que lo entiendas tú; con el centro, sigue el guion («En preparación»): sin fechas ni porcentajes.',
     'image': F + 'buceadores-tortuga.webp', 'ui': 'app:event'},
]
for s in t['tour']:
    assert len(s['title']) <= 80 and len(s['body']) <= 240, (s['title'], len(s['body']))

# 3. Nombres para el comercial (el título de cada diapositiva, lo que ve el centro, no cambia)
NAMES = {
    'como-funciona': 'Cómo funciona: QR y logbook',
    'tu-nombre': 'Tarjetas para compartir',
    'tus-buceadores': 'CRM: los buceadores del centro',
    'perfil-y-mapa': 'Perfil del centro y mapa',
    'condiciones': 'Condiciones para el centro',
}
mods = {m['key']: m for m in t['catalog']}
for k, n in NAMES.items():
    mods[k]['name'] = n
mods['consola']['is_catalog'] = True

# 4. Fotos de fondo: distintas de un módulo al siguiente (antes, todas la misma)
POOL = [F + 'rayos-peces.webp', F + 'buceadores-tortuga.webp', F + 'pareja-arrecife.webp', F + 'tiburon-ballena.webp',
        F + 'pared-azul.webp', 'asset:img/fotos/share-card-bg.webp']
i = 0
for m in t['catalog']:
    props = m.get('props') or {}
    if isinstance(props.get('photo'), str) and props['photo'].startswith('asset:img/'):
        props['photo'] = POOL[i % len(POOL)]
        i += 1
SECTOR = {'centros-buceo': F + 'buceadores-tortuga.webp', 'ong': F + 'tiburon-ballena.webp'}
for s in t['market']:
    if s['key'] in SECTOR:
        s['image'] = SECTOR[s['key']]

# 5. Contexto para la traducción, con la misma idea
t['content_i18n']['notes'] = (
    'Oquea is the diving community: a kind of Strava for divers that connects the diving world internationally, plus a '
    'management tool for dive centres. Divers scan the centre\'s QR after a dive and it is saved in their logbook; they '
    'share their dives with cards; the centre keeps its divers in a CRM and appears on the map. Korean reps sell it to '
    'dive centres in Korea. Prices and commissions: keep numbers and the % sign exactly.'
)
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'oquea 11: recorrido de {len(t["tour"])} pasos, {len(NAMES)} módulos renombrados, {i} fotos de módulo, consola en el catálogo')
