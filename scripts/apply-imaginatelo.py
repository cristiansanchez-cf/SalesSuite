#!/usr/bin/env python3
"""
«Imagínatelo» (feedback de Cristian, 4 de octubre): las dinámicas dejan de ser pestañas con capturas y pasan a ser
escenas de la pantalla en vivo, con su frase en pantalla (lista numerada a la izquierda, pantalla a la derecha).
Además: «Escanea» es casi una transición (una línea) y los hoteles enseñan también las canciones. Va después de
todos los apply-propuesta-*. Idempotente.

    python3 scripts/apply-imaginatelo.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())
SEG = {s['key']: s for s in t['market']}


def sc(scene, label, says, text=None):
    return {'scene': scene, 'label': label, 'says': says, **({'text': text} if text else {})}


def pantalla(blocks, key, title, scenes, lede='', venue=None):
    if key not in blocks:
        return
    props = {'eyebrow': 'Imagínatelo', 'title': title, 'lede': lede, 'djName': '', 'scenes': scenes}
    if venue:
        props['venueName'] = venue
    blocks[key] = {'module': 'pantalla-en-vivo', 'props': props}


MESA = 'Los de la mesa 1 son muy guapos'
loc = SEG['ocio-nocturno']['proposal']['blocks']
pantalla(loc, 'mesas', 'Lo que montan otros locales con esto', [
    sc('club.message', 'Por mesa', 'Pon un número en cada mesa y deja que se escriban por la pantalla.', MESA),
    sc('club.promo', 'Chupito por fotos', 'Con el contador que valida el camarero en dos segundos.', 'Chupito por fotos'),
    sc('club.promo', 'Sorteo', 'Verificable: la app enseña al staff cuántas fotos ha subido esa persona, con hora y segundos.', 'Sorteo por participación'),
])

pro = SEG['promotoras']['proposal']['blocks']
pantalla(pro, 'dinamicas', 'Lo que montan otras promotoras', [
    sc('club.message', 'Entre mesas', 'Mensajes entre mesas.', MESA),
    sc('club.promo', 'Por fotos', 'Chupito o entrada por subir fotos.', 'Chupito o entrada por subir fotos'),
    sc('club.promo', 'Sorteo', 'Sorteo por participación, con el contador que valida tu staff en dos segundos.', 'Sorteo por participación'),
])

con = SEG['conciertos']['proposal']['blocks']
pantalla(con, 'preshow', 'El pre-show', [
    sc('club.photo', 'Álbum de camerino', 'Álbum con fotos de camerino en tiempo real.'),
    sc('club.promo', '¿Cómo lo vivís?', 'Lo lanzas a la pantalla y la grada contesta desde el móvil.', 'Contadnos cómo lo estáis viviendo'),
    sc('club.promo', 'Reto de marca', 'Un reto de la marca, en pantalla, antes de que salga el artista.', 'Reto de marca'),
    sc('club.message', 'Mensajes a la grada', 'Mensajes a la grada, delante de todos.'),
], lede='La hora anterior al artista: público dentro, con el móvil en la mano y una playlist en pantalla.')

hot = SEG['hoteles']['proposal']['blocks']
pantalla(hot, 'dinamicas', 'Lo que puede montar tu equipo', [
    sc('club.photo', 'Foto en pantalla', 'Durante el show, el huésped sube la suya y sale en grande.'),
    sc('club.promo', 'Reto de fotos', 'La app enseña al animador cuántas ha subido esa persona, con la hora, para validarlo en dos segundos.',
       'Sube tres fotos de hoy y entras en el sorteo'),
    sc('club.message', 'Mensajes', 'Felicitaciones, cumpleaños, aniversarios. Lo que hoy se hace por megafonía.', '¡Feliz aniversario, Carmen y Luis!'),
    sc('club.song', 'Canciones', 'Piden su canción desde el móvil y sale en pantalla.'),
], venue='Tu hotel')
# Hoteles: también las canciones en el móvil (el colaborador tiene que poder validar todos los servicios).
steps = hot['huespedes']['props']['parts'][0]['steps']
if not any(s['key'] == 'songs' for s in steps):
    at = next(i for i, s in enumerate(steps) if s['key'] == 'live')
    steps.insert(at, {'key': 'songs', 'label': 'Su canción', 'says': 'O pide la canción que quiere oír.', 'owner': 'Lo que suena, lo eligen ellos'})

# «Escanea»: casi una transición, una línea.
for sg in t['market']:
    for b in (sg.get('proposal') or {}).get('blocks', {}).values():
        for part in b['props'].get('parts', []) if b['module'] == 'movil-invitado' else []:
            for s in part['steps']:
                if s['key'] == 'scan':
                    s['says'] = 'Escanea y entra. Sin descargar nada.'

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('imagínatelo: locales, promotoras, conciertos, hoteles')
