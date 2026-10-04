#!/usr/bin/env python3
"""
Carga los «Guiones verificados» (docs/ventas/enjoy/fuentes/guiones-*.md) en tenants/enjoy/tenant.json.

Reglas de los propios documentos: lo que va entre comillas se carga literal; no se inventa nada; sustituyen a cualquier
guion, frase o táctica cargada antes para ocio-nocturno, promotoras, conciertos y festivales (esas se retiran: quedan
archivadas, con su historial). Volver a ejecutarlo es idempotente.

    python3 scripts/import-guiones.py
"""
import json
import re

SRC = {
    'loc': 'docs/ventas/enjoy/fuentes/guiones-locales-y-promotoras.md',
    'cf': 'docs/ventas/enjoy/fuentes/guiones-conciertos-y-festivales.md',
}
TENANT = 'tenants/enjoy/tenant.json'

# Técnicas del Cerebro de Ventas citadas en los documentos → su fuente (sección «Fuentes» de cada documento).
AC = 'Alfonso y Cristian'
TECH = [
    (r'estructura|no un guion|script cuando conociste', 'Estructura en lugar de guion', AC, 'https://www.youtube.com/watch?v=byXpCoddWoE&t=2247'),
    (r'pre-encuadre', 'Pre-encuadre de la llamada (demo o vídeo previo)', AC, 'https://open.spotify.com/episode/14KepcZYdwbA2bGrNYkaPe'),
    (r'precalificación del decisor', 'Precalificación del decisor', AC, 'https://www.youtube.com/watch?v=_kevP_Tlfgg&t=1567'),
    (r'validación de interés indirecta', 'Validación de interés indirecta (gatekeeper)', AC, 'https://www.youtube.com/watch?v=zF4M8ZRuXIk&t=70'),
    (r'silencio tras el precio', 'El silencio tras el precio', AC, 'https://www.youtube.com/watch?v=DShgDzY-iy8&t=4392'),
    (r'compromiso condicional', 'Compromiso condicional antes de la propuesta', AC, 'https://open.spotify.com/episode/7vg6Hkzu81tz7Cvjiryicf'),
    (r'técnica de la ventana', 'Técnica de la ventana', AC, 'https://open.spotify.com/episode/3mEDQoF29pC8r8cZeWuM0U'),
    (r'precio no es argumentable', 'El precio no es argumentable + pedido de prueba', AC, 'https://open.spotify.com/episode/0qeNfVC9WdspykfNqHClJ8'),
    (r'desglose del «déjame pensarlo»', 'Desglose del «déjame pensarlo»', 'Manuel Trejo', 'https://www.tiktok.com/@manueltrejove/video/7648050248446790933'),
    (r'preguntar sin intrusión', 'Preguntar sin intrusión', AC, 'https://www.youtube.com/watch?v=DShgDzY-iy8&t=3661'),
    (r'contrato de 10 minutos', 'Contrato de 10 minutos + 5 preguntas', AC, 'https://open.spotify.com/episode/4NZ9JFpI5uMqFtIh0p47mp'),
    (r'micro-datos', 'Reconstrucción de la cifra por micro-datos', AC, 'https://open.spotify.com/episode/0bMCxPZTmVfk4vCRldwp1D'),
    (r'pregunta puente', 'Pregunta puente venta → cierre', AC, 'https://open.spotify.com/episode/5kD92FKCcyPg9DXglfWtu1'),
    (r'analogía del mecánico', 'Analogía del mecánico', AC, 'https://open.spotify.com/episode/2y59HltuOngnq5H0EjR8k6'),
    (r'sondeo del ausente', 'Sondeo del ausente', AC, 'https://www.youtube.com/watch?v=_kevP_Tlfgg&t=1321'),
    (r'dar la salida', 'Dar la salida al cliente', AC, 'https://www.youtube.com/watch?v=DShgDzY-iy8&t=4089'),
    (r'reactivación de lead frío', 'Reactivación de lead frío', 'Manuel Trejo', 'https://www.tiktok.com/@manueltrejove/video/7625702617200545045'),
    (r'justificar el precio', 'No justificar el precio', AC, 'https://www.youtube.com/watch?v=DShgDzY-iy8&t=4576'),
]

LOC, PROM, CON, FEST = 'ocio-nocturno', 'promotoras', 'conciertos', 'festivales'
BOTH = [LOC, PROM]   # la parte de locales vale también para promotoras («hereda casi todo»), salvo lo solo de local
CF = [CON, FEST]

# key → (kind, stage, segments, objection, personas)
META = {
    'loc-no-recitar': ('tip', 'mentalidad', BOTH, None, []),
    'loc-preparacion': ('tip', 'prospeccion', BOTH, None, []),
    'loc-demo-previa': ('script', 'prospeccion', BOTH, None, []),
    'loc-cuando-ir': ('tip', 'prospeccion', [LOC], None, []),
    'loc-apertura': ('script', 'primer_contacto', [LOC], None, []),
    'loc-apertura-que-es': ('script', 'primer_contacto', BOTH, None, []),
    'loc-no-apertura': ('tip', 'primer_contacto', BOTH, None, []),
    'loc-contrato-10min': ('discovery', 'descubrimiento', BOTH, None, []),
    'loc-cinco-preguntas': ('discovery', 'descubrimiento', BOTH, None, []),
    'loc-cierre-diagnostico': ('discovery', 'descubrimiento', BOTH, None, []),
    'loc-reconstruir-coste': ('discovery', 'descubrimiento', BOTH, None, []),
    'loc-pitch-contenido': ('pitch', 'pitch_demo', [LOC], None, []),
    'loc-pitch-barra': ('pitch', 'pitch_demo', [LOC], None, ['propietario-local', 'gerente-local']),
    'loc-pitch-canciones': ('pitch', 'pitch_demo', [LOC], None, []),
    'loc-pitch-coldplay': ('pitch', 'pitch_demo', BOTH, None, []),
    'loc-dj-adelantar': ('pitch', 'pitch_demo', [LOC], None, []),
    'loc-dj-propina': ('pitch', 'pitch_demo', [LOC], None, []),
    'loc-dj-no-preguntar': ('tip', 'pitch_demo', [LOC], None, ['dj-residente']),
    'loc-puente': ('monetization', 'negociacion', BOTH, None, []),
    'loc-compromiso': ('monetization', 'negociacion', BOTH, None, []),
    'loc-precio': ('monetization', 'negociacion', [LOC], None, []),
    'loc-silencio': ('monetization', 'negociacion', BOTH, None, []),
    'loc-precio-pronto': ('monetization', 'negociacion', BOTH, 'precio', []),
    'loc-no-etiquetar': ('monetization', 'negociacion', BOTH, None, []),
    'loc-prueba': ('script', 'cierre', [LOC], None, []),
    'loc-obj-ambiente': ('objection', 'objeciones', [LOC], 'desconfianza', ['dj-residente']),
    'loc-obj-operativa': ('objection', 'objeciones', BOTH, 'tiempo', []),
    'loc-obj-pantallas': ('objection', 'objeciones', BOTH, 'ya_tengo_proveedor', []),
    'loc-obj-que-gano': ('objection', 'objeciones', [LOC], 'no_lo_necesito', []),
    'loc-obj-precio': ('objection', 'objeciones', [LOC], 'precio', []),
    'loc-obj-socio': ('objection', 'objeciones', BOTH, 'no_decido_yo', []),
    'loc-obj-pensar': ('objection', 'objeciones', BOTH, 'tiempo', []),
    'loc-obj-referido': ('tip', 'seguimiento', BOTH, None, []),
    'loc-msg-seguimiento-noche1': ('script', 'seguimiento', BOTH, None, []),
    'loc-msg-reactivacion': ('script', 'seguimiento', [LOC], None, []),
    'loc-msg-filtro': ('tip', 'primer_contacto', BOTH, None, []),
    'loc-no-decir': ('tip', 'mentalidad', BOTH, None, []),
    'prom-diferencias': ('fit', 'descubrimiento', [PROM], None, []),
    'prom-quien-encaja': ('fit', 'prospeccion', [PROM], None, []),
    'prom-apertura': ('script', 'primer_contacto', [PROM], None, ['promotor-eventos']),
    'prom-pitch': ('pitch', 'pitch_demo', [PROM], None, []),
    'prom-pitch-dinamicas': ('pitch', 'pitch_demo', [PROM], None, []),
    'prom-precio': ('monetization', 'negociacion', [PROM], None, []),
    'prom-cierre': ('script', 'cierre', [PROM], None, []),
    'prom-seguimiento': ('tip', 'seguimiento', [PROM], None, []),
    'prom-canal': ('tip', 'seguimiento', [PROM], None, []),
    # conciertos
    'con-preparacion': ('tip', 'prospeccion', [CON], None, []),
    'con-demo-previa': ('script', 'prospeccion', [CON], None, []),
    'con-apertura': ('script', 'primer_contacto', [CON], None, []),
    'con-decisor': ('script', 'primer_contacto', [CON], 'no_decido_yo', []),
    'con-gatekeeper': ('script', 'prospeccion', [CON], None, []),
    'con-pitch-preshow': ('pitch', 'pitch_demo', [CON], None, []),
    'con-pitch-promotor': ('pitch', 'pitch_demo', [CON], None, ['promotor', 'recinto-sala']),
    'con-pitch-manager': ('pitch', 'pitch_demo', [CON], None, ['manager-artista', 'artista']),
    'con-pitch-album': ('pitch', 'pitch_demo', [CON], None, []),
    'con-pitch-produccion': ('pitch', 'pitch_demo', [CON], None, ['direccion-produccion', 'tour-manager']),
    'con-advance': ('script', 'cierre', [CON], None, []),
    'con-ancla': ('monetization', 'negociacion', [CON], None, []),
    'con-compromiso': ('monetization', 'negociacion', [CON], None, []),
    'con-precio': ('monetization', 'negociacion', [CON], None, []),
    'con-charanga-pitch': ('pitch', 'pitch_demo', [CON], None, ['charanga-orquesta']),
    'con-charanga-precio': ('monetization', 'negociacion', [CON], None, ['charanga-orquesta']),
    'con-charanga-no': ('tip', 'pitch_demo', [CON], None, ['charanga-orquesta']),
    'con-obj-pantallas': ('objection', 'objeciones', [CON], 'ya_tengo_proveedor', []),
    'con-obj-moviles': ('objection', 'objeciones', [CON], 'desconfianza', ['manager-artista', 'artista']),
    'con-obj-cobertura': ('objection', 'objeciones', [CON], None, []),
    'con-obj-validar': ('objection', 'objeciones', [CON], 'tiempo', []),
    'con-obj-tiempo': ('objection', 'objeciones', [CON], 'tiempo', ['direccion-produccion']),
    'con-obj-patrocinador': ('objection', 'objeciones', [CON], 'no_decido_yo', []),
    'con-obj-derechos': ('objection', 'objeciones', [CON], 'desconfianza', []),
    'con-obj-directo': ('objection', 'objeciones', [CON], None, []),
    'con-obj-precio': ('objection', 'objeciones', [CON], 'precio', []),
    # festivales
    'fest-cuando': ('tip', 'prospeccion', [FEST], None, []),
    'fest-modelo-a': ('fit', 'descubrimiento', [FEST], None, []),
    'fest-modelo-b': ('pitch', 'pitch_demo', [FEST], None, []),
    'fest-apertura': ('script', 'primer_contacto', [FEST], None, []),
    'fest-pitch-independiente': ('pitch', 'pitch_demo', [FEST], None, []),
    'fest-pitch-grande': ('pitch', 'pitch_demo', [FEST], None, []),
    'fest-una-pantalla': ('pitch', 'pitch_demo', [FEST], None, []),
    'fest-presencial': ('script', 'cierre', [FEST], None, []),
    'fest-precio': ('monetization', 'negociacion', [FEST], None, []),
    'fest-obj-cuesta': ('objection', 'objeciones', [FEST], 'precio', []),
    'fest-obj-pantallas': ('objection', 'objeciones', [FEST], 'ya_tengo_proveedor', []),
    'fest-obj-cobertura': ('objection', 'objeciones', [FEST], None, []),
    'fest-obj-ano-viene': ('objection', 'objeciones', [FEST], 'tiempo', []),
    'fest-no-vender': ('tip', 'mentalidad', [FEST], None, []),
    # común a conciertos y festivales (gen-no-decir vale para todos: se queda general)
    'gen-no-decir': ('tip', 'mentalidad', [], None, []),
    'gen-traer-vuelta': ('tip', 'seguimiento', CF, None, []),
    'gen-seguimiento-cf': ('tip', 'seguimiento', CF, None, []),
}
# Orden de carga (el guion los enseña en este orden): el de los documentos, con el compromiso antes del precio.
TITLES_MISSING = {'con-charanga-precio': 'Precio para charangas y orquestas', 'prom-precio': 'Precio'}
# Secciones sin `key` en el fuente: se cargan con una key nuestra.
UNKEYED = {
    'loc-no-decir': ('loc', r'^## 10\. LO QUE NO SE DICE NUNCA', 'Lo que no se dice nunca'),
    'prom-diferencias': ('loc', r'^## 11\. Las cuatro diferencias con un local', 'Las cuatro diferencias con un local'),
    'prom-quien-encaja': ('loc', r'^## 12\. Quién encaja', 'Quién encaja (y quién no)'),
    'fest-no-vender': ('cf', r'^## B\.5 Lo que NO se vende en festivales', 'Lo que NO se vende en festivales'),
}
# Notas del documento dirigidas a quien monta la app: se sustituyen por la instrucción al comercial.
APP_NOTE = ('**En la app:** la demo interactiva (la pantalla y el móvil del invitado) vive dentro de una propuesta. '
            'Monta la propuesta del cliente **antes** de la llamada y mándale su enlace: llega con su nombre dentro.')
APP_NOTE_LOC = APP_NOTE + ' **PENDIENTE:** un clip corto de una sala llena con caras en la pantalla.'

HEAD = re.compile(r'^#{2,3} `([a-z0-9-]+)`(?: · (.+))?\s*$')


def sections(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    out, cur, buf = {}, None, []

    def flush():
        if cur:
            out[cur[0]] = (cur[1], buf[:])
    for ln in lines:
        m = HEAD.match(ln)
        if m or ln.startswith('#') or ln.strip() == '---':
            flush(); buf = []
            cur = (m.group(1), (m.group(2) or '').strip()) if m else None
            continue
        if cur:
            buf.append(ln)
    flush()
    return out, lines


def unkeyed(lines, pattern):
    start = next(i for i, ln in enumerate(lines) if re.match(pattern, ln))
    body = []
    for ln in lines[start + 1:]:
        if ln.startswith('#') or ln.strip() == '---':
            break
        body.append(ln)
    return body


def clean(body_lines, key):
    text = '\n'.join(body_lines).strip()
    # La nota «para quien monte esto en la app» no es para el comercial: se cambia por la instrucción.
    text = re.sub(r'\*\*Nota para quien monte esto en la app:\*\*[^\n]*(?:\n(?!\n)[^\n]*)*',
                  APP_NOTE_LOC if key.startswith('loc') else APP_NOTE, text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def refs(text):
    seen, out = set(), []
    low = text.lower()
    for pat, title, creator, url in TECH:
        if re.search(pat, low) and title not in seen:
            seen.add(title)
            out.append({'source': 'cerebro', 'title': title, 'creator': creator, 'url': url})
    return out[:10]


def main():
    t = json.load(open(TENANT, encoding='utf-8'))
    pieces = {}
    for doc, path in SRC.items():
        secs, lines = sections(path)
        for key, (title, body) in secs.items():
            pieces[key] = (title or TITLES_MISSING.get(key, key), clean(body, key))
        for key, (d, pat, title) in UNKEYED.items():
            if d == doc:
                pieces[key] = (title, clean(unkeyed(lines, pat), key))
    missing = [k for k in META if k not in pieces]
    extra = [k for k in pieces if k not in META]
    assert not missing, f'faltan en los documentos: {missing}'
    assert not extra, f'sin clasificar: {extra}'

    # Lo que «sustituyen»: lo cargado antes para esos sectores. Se quedan los datos de contexto que no son guion ni
    # táctica y que los documentos no cubren.
    KEEP = {'noche-bajas', 'noche-casetas', 'noche-pendiente', 'conc-pendiente', 'fest-desconocido', 'fest-sano', 'conc-moderacion'}
    S = {LOC, PROM, CON, FEST}
    retired = set(t.get('retired_plays', []))
    for p in t['playbook']:
        if p['key'] in META or p['key'] in KEEP:
            continue
        if set(p.get('segments') or []) & S:
            retired.add(p['key'])
    retired |= {'fest-acompanamiento', 'gen-seguimiento-causa'}   # duplicados de fest-presencial y gen-seguimiento
    retired -= set(META)

    by_key = {p['key']: p for p in t['playbook']}
    kept = [p for p in t['playbook'] if p['key'] not in retired and p['key'] not in META]
    new = []
    order = list(META)
    # el compromiso condicional va antes del precio (lo dice el propio documento)
    order.remove('con-compromiso'); order.insert(order.index('con-precio'), 'con-compromiso')
    for key in order:
        kind, stage, segs, objection, personas = META[key]
        title, body = pieces[key]
        prev = by_key.get(key, {})
        new.append({
            'key': key, 'module_key': None, 'kind': kind, 'stage': stage, 'objection': objection,
            'segments': segs, 'personas': personas, 'title': title, 'body': body,
            'when_to_use': prev.get('when_to_use') if key == 'gen-no-decir' else None,
            'why_it_works': None, 'technique_refs': refs(body),
        })
    t['playbook'] = kept + new
    t['retired_plays'] = sorted(retired)
    json.dump(t, open(TENANT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open(TENANT, 'a').write('\n')
    print(f'{len(new)} jugadas de los guiones verificados · {len(kept)} se quedan · {len(retired)} retiradas')


if __name__ == '__main__':
    main()
