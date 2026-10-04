#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json las correcciones del agente de ventas a 03/04
(docs/ventas/enjoy/fuentes/correcciones-03-04.md). Idempotente: se puede volver a ejecutar.

- A: los guiones de ocio nocturno pasan de `loc-` a `noche-` y los de conciertos de `con-` a `conc-`;
  si ya existía una jugada que decía lo mismo, se reutiliza su key (se actualiza, no se duplica).
- B: bodas sin datos inventados. C: Pantalla en vivo y Móvil del invitado con jugadas.
- D: duplicados fusionados. E.3: jugadas fijas de la bienvenida. F: paso 0 «Por qué existimos».

    python3 scripts/apply-correcciones-03-04.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
plays = t['playbook']
BODAS_LOC = {'loc-pitch', 'loc-discovery', 'loc-obj-proveedor', 'loc-monet'}

# A · fusiones con jugadas que ya existían (misma idea) y renombrado de prefijos.
MERGE = {
    'loc-cuando-ir': 'noche-calendario', 'loc-dj-adelantar': 'noche-dj-menu', 'loc-prueba': 'noche-prueba-hoy',
    'loc-precio': 'noche-precios', 'loc-obj-precio': 'noche-obj-caro', 'loc-pitch-barra': 'noche-pantalla-movil',
    'con-obj-precio': 'conc-obj-caro', 'con-obj-pantallas': 'conc-obj-pantallas', 'con-obj-derechos': 'conc-obj-derechos',
    'con-pitch-produccion': 'conc-ndi', 'con-charanga-pitch': 'conc-menu-cerrado', 'fest-una-pantalla': 'conc-multipantalla',
}
# Se funden en `conc-obj-pantallas` (una sola objeción de pantallas para todos los sectores).
FOLD_PANTALLAS = {'loc-obj-pantallas', 'fest-obj-pantallas'}


def new_key(k: str) -> str:
    if k in MERGE:
        return MERGE[k]
    if k.startswith('loc-') and k not in BODAS_LOC:
        return 'noche-' + k[4:]
    if k.startswith('con-'):
        return 'conc-' + k[4:]
    return k


renamed_from = []
by = {p['key']: p for p in plays}
pant = by.get('con-obj-pantallas') or by.get('conc-obj-pantallas')
if pant and any(k in by for k in FOLD_PANTALLAS):
    loc = by.get('loc-obj-pantallas')
    body = pant['body']
    if loc and 'abre ventana' in loc['body'] and 'abre ventana' not in body:
        body += '\n\n' + loc['body'].split('\n', 1)[1].strip()  # lo de la ventana (Alfonso y Cristian), literal
    pant['body'] = body
    pant['segments'] = ['ocio-nocturno', 'promotoras', 'conciertos', 'festivales']
    refs = {r['title']: r for r in pant.get('technique_refs', [])}
    for k in FOLD_PANTALLAS:
        for r in by.get(k, {}).get('technique_refs', []):
            refs.setdefault(r['title'], r)
    pant['technique_refs'] = list(refs.values())
    plays = [p for p in plays if p['key'] not in FOLD_PANTALLAS]
    renamed_from += [k for k in FOLD_PANTALLAS if k in by]

for p in plays:
    k = new_key(p['key'])
    if k != p['key']:
        renamed_from.append(p['key'])
        p['key'] = k
by = {p['key']: p for p in plays}
assert len(by) == len(plays), 'keys duplicadas tras renombrar'

# B · bodas sin datos inventados.
plays = [p for p in plays if p['key'] != 'exp-prueba']
if by.get('exp-upsell'):
    by['exp-upsell'].update(title='Las experiencias, en pack', why_it_works=None, body=(
        'Vende las experiencias en pack, no sueltas. El coste marginal de añadir una es casi cero y una experiencia '
        'suelta compite con lo que ya hace el DJ.\n\n**Descuentos: los de la tabla oficial, ninguno más.**'))
if by.get('loc-monet'):
    by['loc-monet'].update(body='PENDIENTE · precio de bodas sin definir; nunca hemos cobrado una boda', when_to_use=None, why_it_works=None)
by['bodas-aviso'].update(kind='tip', stage='mentalidad', audience='team', body=(
    'Bodas es el sector del que menos sabemos y el único donde nunca hemos cobrado. Hubo 12 leads, pricing cerrado y '
    'resellers definidos: a los organizadores que iban a pagarnos 300 €/mes les pareció buena idea y no pagó ninguno; '
    'a los resellers con 100 € de base les pareció bien y no revendió ninguno. Cuando un precio le parece bien a todo '
    'el mundo y no compra nadie, el problema no es el precio. Todo lo que hay en este sector son hipótesis.'))
# La kiss-cam no está en «Lo que existe hoy»: fuera del texto.
if by.get('exp-demo'):
    by['exp-demo']['body'] = by['exp-demo']['body'].replace('TU móvil con la kiss-cam abierta', 'TU móvil').replace('vista previa del dossier', 'vista previa de la propuesta')

# D · «Es caro» general: la respuesta común; cada sector añade su ancla en su propia jugada.
by['empresa-obj-precio'].update(title='«Es caro»', when_to_use=None, why_it_works=None, body=(
    'El precio no se argumenta: se cambia de línea.\n\nCada sector tiene su ancla: en locales, los dos meses sin '
    'permanencia; en conciertos, los 8.000 € de una kiss cam clásica.'))

# C · módulos.
MODULE = {
    'conc-ndi': 'pantalla-en-vivo', 'noche-pantalla-movil': 'pantalla-en-vivo', 'gen-venta-barra': 'pantalla-en-vivo',
    'conc-multipantalla': 'pantalla-en-vivo', 'conc-obj-pantallas': 'pantalla-en-vivo',
    'exp-demo': 'movil-invitado', 'conc-obj-derechos': 'movil-invitado', 'gen-consentimiento': 'movil-invitado',
    'conc-menu-cerrado': 'tabs-experiencias',
}
for k, m in MODULE.items():
    if k in by:
        by[k]['module_key'] = m


def play(key, title, body, kind='tip', stage='mentalidad', module=None, **kw):
    return {'key': key, 'module_key': module, 'kind': kind, 'stage': stage, 'objection': None, 'segments': [], 'personas': [],
            'audience': kw.get('audience', 'all'), 'about': kw.get('about', False), 'pinned': None, 'title': title, 'body': body,
            'when_to_use': None, 'why_it_works': kw.get('why'), 'technique_refs': [], 'status': 'official'}


NEW_FRONT = [
    play('pantalla-que-ve', 'Lo que se ve en la pantalla', (
        'El 90 % de la noche la pantalla enseña un QR grande: ese es el anzuelo, sin eso no entra nadie. Cuando alguien '
        'pide algo, salta a pantalla completa con su nombre y su dedicatoria, y vuelve al QR. Si ya tienes visuales, nos '
        'ponemos encima en una tarjeta pequeña sin taparlos.'), kind='pitch', stage='pitch_demo', module='pantalla-en-vivo'),
    play('movil-sin-app', 'Sin app y sin registro', (
        'Abre la cámara, apunta al QR y ya está dentro. Sin descargar nada y sin registrarse. Elige qué quiere hacer, lo '
        'manda, y si alguien lo valida sale en pantalla en segundos. Todo lo que ha subido se le queda en el álbum.'),
        kind='pitch', stage='pitch_demo', module='movil-invitado'),
    play('gen-prueba-escaneo', 'El público sí escanea', (
        'En 2025 se registraron cerca de 30.000 peticiones de canciones con muy pocos eventos. Es lo que demuestra que el '
        'público sí escanea un QR dentro de un evento.'), kind='proof', stage='pitch_demo',
        why='Es el único dato de participación que tenemos y es real.'),
]

# F · paso 0: «Por qué existimos» (literal del documento).
ABOUT = [
    play('vision', 'La visión', (
        'La gente sale menos y, cuando sale, está con el móvil. Pelearse contra eso es perder. Enjoy no quiere que la gente '
        'mire menos el móvil: quiere que lo que haga con él pase en la sala y no en otro sitio. Que pida la canción que está '
        'sonando, que mande un mensaje que lee toda la pista, que suba una foto y la vea en pantalla a los diez segundos. Que '
        'alguien le diga «¿tú también has pedido esa?» y se conozcan. El móvil como excusa para una conexión real, no como '
        'sustituto.'), about=True),
    play('por-que-ahora', 'Por qué ahora', (
        'El ocio nocturno se está copiando a sí mismo: las mismas fiestas temáticas, la misma música, los mismos carteles. '
        'Diferenciarse dejó de ser una ventaja y pasó a ser una condición. A la vez, los locales necesitan contenido para '
        'redes cada semana y lo resuelve el encargado con el móvil a las cuatro de la mañana. Y las marcas que patrocinan '
        'están exigiendo medir lo que compran. Las tres cosas se resuelven con lo mismo: que el público participe desde su '
        'móvil y deje su contenido con permiso.'), about=True),
    play('estrategia-bandera', 'Plantar la bandera', (
        'Queremos estar en el máximo número de sitios posible, cuanto antes, y por eso a veces vale la pena entrar sin cobrar '
        'lo que valdría.\n\nEn el peor de los casos, un sitio puede empezar solo con el QR de peticiones de canciones, sin '
        'pantalla y sin coste. Eso no es regalar el producto: es que cada sitio donde esto funciona es un sitio donde el dueño '
        've pasar algo en su propia sala, y la conversación de dentro de tres meses empieza mucho más arriba.\n\n**Esto es '
        'contexto para que entiendas por qué hacemos lo que hacemos. No es una oferta que puedas poner tú sobre la mesa:** '
        'cualquier entrada por debajo de tarifa la autoriza el fundador.'), about=True, audience='team'),
    play('estrategia-datos', 'Por qué los datos importan tanto', (
        'Cada noche encendida son datos que nadie más tiene: qué se pide, dónde, a qué hora y con qué público. Eso tiene '
        'valor para gente que hoy no nos compra a nosotros — marcas de bebidas que llevan años intentando saber algo de quién '
        'consume en una discoteca, y discográficas a las que les interesa qué suena y qué piden en cada ciudad.\n\nHemos '
        'tenido conversaciones en esa dirección. **Ninguna es un acuerdo cerrado y no se menciona a ningún cliente.** Está '
        'aquí para que entiendas por qué insistimos tanto en que cada sitio esté activo y en que la gente dé su '
        'consentimiento: el negocio de dentro de dos años se construye con lo que se enciende este año.'), about=True, audience='team'),
    play('estrategia-djs', 'Los DJ como canal', (
        'El DJ ha sido históricamente quien nos ha tumbado acuerdos, y fue culpa de cómo lo planteamos: le dábamos trabajo y '
        'no le dábamos nada. Ahora al revés. El menú cerrado hace que nadie le toque el repertorio. El dinero de las '
        'peticiones va a la cuenta del local, y lo que recomendamos —porque es lo que funciona en La Biblioteca— es que se '
        'reparta como propina de todo el equipo: así el DJ que no acepta peticiones está dejando sin propina a sus '
        'compañeros, y eso lo vigila la plantilla sola. De bloqueante a aliado.'), about=True),
    play('modelo', 'Cómo gana dinero la empresa', (
        'Cuota mensual por tramo de aforo en locales. Precio por evento en conciertos, festivales y promotoras puntuales. '
        'Suscripción cuando hay recurrencia: promotoras, agencias, infraestructuras de temporada.\n\nEl dinero que paga el '
        'público por sus peticiones y mensajes **no es nuestro**: va a la cuenta del local. Cobramos por el servicio, no por '
        'el consumo de su público.\n\nLo que todavía no vendemos: CRM de fidelización, remarketing, bonos de consumición y '
        'manejo múltiple de pantallas.'), about=True),
    play('objetivos', 'Los objetivos de este año', (
        '**PENDIENTE — lo rellena Cristian.** Formato: cuántos locales de pago a cierre de año, en qué ciudades, qué MRR, '
        'cuántos eventos de concierto o festival, y cuántos casos de éxito con nombre.'), about=True, audience='team'),
    play('no-somos', 'Lo que no somos', (
        'No somos una kiss cam: no grabamos a nadie sin que lo sepa. No somos una app de peticiones para DJs: es una parte, y '
        'la que menos vendemos. No somos una agencia de contenido ni montamos nada físico. No damos soporte 24 horas. Y no '
        'prometemos que el servicio se pague solo con las peticiones: depende del público y de la temporada, y quien lo '
        'prometió antes perdió al cliente cuando no se cumplió.'), about=True),
]
fresh = {p['key'] for p in ABOUT + NEW_FRONT}
plays = ABOUT + NEW_FRONT + [p for p in plays if p['key'] not in fresh]

# E.3 · fijas en la bienvenida (hasta 20 cierres). `gen-seguimiento-causa` se fundió en `gen-seguimiento`.
for p in plays:
    p['pinned'] = {'gen-seguimiento': 1, 'noche-prueba-hoy': 2, 'gen-precio-reglas': 3}.get(p['key'])

live = {p['key'] for p in plays}
retired = [k for k in t.get('retired_plays', []) if k not in live]
retired += [k for k in renamed_from + ['exp-prueba'] if k not in live and k not in retired]
t['playbook'] = plays
t['retired_plays'] = retired
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'{len(plays)} jugadas · {len(renamed_from)} renombradas o fundidas · {len(retired)} retiradas')
