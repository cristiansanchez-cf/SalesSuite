#!/usr/bin/env python3
"""
Aplica a tenants/enjoy/tenant.json el documento 14 «HOTELES, RESORTS Y CRUCEROS · tesis y dossier»
(docs/ventas/enjoy/fuentes/propuesta-14-hoteles.md). Vertical sin validar: cero conversaciones, cero clientes. Lo lleva un
colaborador externo (Ángel), que no entra en la plataforma: enseña un dossier de validación de 6 diapositivas, sin precio
y sin nombre de cliente (lo crea sample-dossiers.ts). Idempotente.

    python3 scripts/apply-propuesta-14.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())

GRATIS = ('«Aquí el servicio va gratis para el huésped. Si en algún momento queréis dejar que alguien deje una propina, se puede, '
          'y ese dinero se queda en el hotel. Pero por defecto, gratis.»')

# ---------------------------------------------------------------- el dossier de validación (sección 5), literal
proposal = {
    'blocks': {
        'portada': {'module': 'portada', 'props': {
            # Portada que propuso el agente de ventas después del 14 (sustituye a «Que la gente que no sale del hotel…»).
            'eyebrow': 'Entretenimiento interactivo para hoteles y resorts', 'title': 'Lo que tus huéspedes van a contar cuando vuelvan a casa',
            'subtitle': 'Participan desde el móvil, salen en la pantalla y se llevan las fotos.'}},
        'problema': {'module': 'lo-que-te-pasa', 'props': {'title': 'Lo que pasa hoy', 'cards': [
            {'problem': 'Tu equipo de animación entretiene a las mismas personas durante dos semanas.',
             'solution': 'Una actividad nueva que se renueva sola, porque la hacen ellos.'},
            {'problem': 'Hay horas muertas: la espera del show, la sobremesa, la tarde de piscina.',
             'solution': 'Algo que hacer desde el móvil, sin montar nada ni sacar a nadie.'},
            {'problem': 'El contenido de tus redes lo tienes que producir tú.',
             'solution': 'Cientos de fotos de huéspedes pasándoselo bien, subidas por ellos y con permiso para usarlas.'}]}},
        'huespedes': {'module': 'movil-invitado', 'props': {
            'eyebrow': 'Tus huéspedes', 'title': 'Lo que van a hacer tus huéspedes', 'lede': '', 'djName': '', 'price': 0,
            'ownerLabel': 'Lo que significa para ti', 'parts': [{'title': 'Lo que van a hacer tus huéspedes', 'steps': [
                {'key': 'scan', 'says': 'Apunta con la cámara al QR de la mesa. Sin descargar nada.', 'owner': 'Participa todo el mundo, de cualquier edad'},
                {'key': 'form', 'label': 'Su foto o su mensaje', 'says': 'Sube su foto o manda su mensaje.', 'owner': 'Tu equipo decide qué sale, desde el móvil'},
                {'key': 'live', 'says': 'Sale en la pantalla delante de todos.', 'owner': 'La sala entera mirando a ver quién aparece'},
                {'key': 'album', 'says': 'Se queda en el álbum de la semana.', 'owner': 'Contenido de tu hotel, con permiso para publicarlo'},
            ]}]}},
        'dinamicas': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Tu equipo', 'title': 'Lo que puede montar tu equipo', 'tabs': [
            {'label': 'Foto en pantalla', 'title': 'Foto en pantalla durante el show', 'body': 'El huésped sube la suya y sale en grande.', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/live/kisscam-mobile.webp', 'alt': 'Su foto, en la pantalla'}},
            {'label': 'Reto de fotos', 'title': 'Reto de fotos',
             'body': '«Sube tres fotos de hoy y entras en el sorteo.» La app enseña al animador cuántas ha subido esa persona, con la hora, para validarlo en dos segundos.',
             'bullets': [], 'mock': {'kind': 'image', 'src': 'asset:img/tabs/album-grid.webp', 'alt': 'Fotos subidas por los huéspedes'}},
            {'label': 'Mensajes', 'title': 'Mensajes en pantalla',
             'body': 'Felicitaciones, cumpleaños, aniversarios. Lo que hoy se hace por megafonía.', 'bullets': [],
             'mock': {'kind': 'image', 'src': 'asset:img/tabs/messages-screen.webp', 'alt': 'Mensajes de los huéspedes en pantalla'}}]}},
        'por-dentro': {'module': 'tabs-experiencias', 'props': {'eyebrow': 'Por dentro', 'title': 'Cómo funciona por dentro', 'tabs': [{
            'label': 'Por dentro', 'title': 'Sin tocar nada de lo que ya tenéis',
            'body': 'Se abre en un navegador o en una Smart TV, o se instala en el ordenador que ya tenéis conectado a la pantalla.',
            'bullets': ['Lo lleva quien vosotros digáis, desde su móvil.', 'Todo lo que sale en pantalla lo valida una persona. Siempre.',
                        'El servicio va gratis para el huésped.', 'Cada huésped lo ve en su idioma: la app detecta el del móvil.']}]}},
        'hablemos': {'module': 'portada', 'props': {
            'eyebrow': 'Enjoy para hoteles y resorts', 'title': 'Hablemos',
            'subtitle': 'Cuéntanos cómo funciona vuestro programa de animación y os decimos si esto encaja.',
            'ctas': [{'label': 'Escríbenos', 'href': 'mailto:hola@enjoytheclub.es', 'variant': 'primary'}]}},
    },
    'modes': {'full': ['portada', 'problema', 'huespedes', 'dinamicas', 'por-dentro', 'hablemos']},
    'max': {'full': 6},
}

SEGMENT = {
    'key': 'hoteles', 'name': 'Hoteles y resorts', 'icon': 'hotel', 'image': None,
    'description': 'Resorts all-inclusive, hoteles vacacionales alejados del centro y hoteles con salón de eventos. Cruceros, más adelante.',
    'value_prop': ('El sitio del que la gente no sale. Su problema no es el dinero: es llenar el tiempo. Aquí no vendemos monetización, '
                   'vendemos satisfacción y contenido: el huésped que se aburre no se queja, se va y pone una reseña tibia. Y cientos de '
                   'fotos de huéspedes pasándoselo bien, subidas por ellos aceptando los términos de uso.'),
    'icp': ('- Resort all-inclusive con equipo de animación propio y show nocturno\n- Hotel vacacional alejado del centro, donde el huésped cena y se queda\n'
            '- Hotel con salón de eventos: bodas, incentivos, convenciones. Entrada fácil aunque la animación no compre\n'
            '- Hoteles pequeños independientes, para eventos puntuales: la validación más rápida'),
    'disqualifiers': ('- Hotel urbano de paso: el huésped sale a la ciudad\n- Hotel de negocios sin programa de entretenimiento\n'
                      '- Sitios sin pantalla en ninguna zona común\n- Crucero, hasta que sepamos lo de la conectividad'),
    'buying_process': ('Compra el director de entretenimiento y actividades: es su presupuesto y su problema. El jefe de animación es el aliado '
                       'natural. Dirección firma lo que cuesta dinero (en hoteles pequeños, a veces directamente). En cadenas grandes la venta es '
                       'larga y con mucha gente.'),
    'deal_size': 'Sin tarifa: el dossier va sin precio.',
    'sales_cycle': 'Uno o dos meses entre que se tantea y alguien decide algo. En hoteles pequeños, rápido para sus eventos puntuales.',
    'notice': ('Vertical sin validar: cero conversaciones, cero clientes. Lo lleva un colaborador externo que ya vende a este sector. El objetivo '
               'no es vender, es saber si la vertical existe. Nunca se habla de cobrar al huésped ni de precio.'),
    'proposal': proposal,
    'modules': [
        {'module_key': 'movil-invitado', 'priority': 1, 'fit': 'Lo que hace el huésped y lo que significa para el hotel.'},
        {'module_key': 'tabs-experiencias', 'priority': 1, 'fit': 'Las tres dinámicas que puede montar el equipo de animación.'},
        {'module_key': 'pantalla-en-vivo', 'priority': 2, 'fit': 'Su pantalla, en la piscina, el buffet o el teatro.'},
    ],
    'personas': [
        {'key': 'hotel-entretenimiento', 'name': 'Director/a de entretenimiento y actividades', 'role': 'decisor',
         'goals': 'Diseñar la estrategia de animación y que el huésped responda bien.', 'pains': 'Entretener a los mismos huéspedes siete o catorce días seguidos.',
         'kpis': 'Encuestas al huésped, observación directa, valoraciones online.', 'objections': ['no_lo_necesito', 'tiempo'],
         'how_to_approach': 'Es el comprador: su presupuesto y su problema.', 'avoid': 'Hablar de cobrar al huésped.',
         'can_help': 'Decide qué entra en el programa de animación.', 'can_block': 'Si le complica la vida a su equipo.', 'angles': []},
        {'key': 'hotel-jefe-animacion', 'name': 'Jefe/a de animación', 'role': 'campeon',
         'goals': 'Coordinar al equipo y planificar las actuaciones en directo.', 'pains': 'Cuando se acaba el repertorio de juegos, se repite.',
         'kpis': None, 'objections': ['tiempo'], 'how_to_approach': 'Lo usa a diario: aliado natural.', 'avoid': None,
         'can_help': 'Empuja dentro.', 'can_block': None, 'angles': []},
        {'key': 'hotel-animadores', 'name': 'Animadores', 'role': 'usuario', 'goals': 'Dinamizar las actividades cara a cara con el huésped.',
         'pains': None, 'kpis': None, 'objections': ['tiempo'], 'how_to_approach': 'Quienes lo operan: que no les complique la vida.', 'avoid': None,
         'can_help': None, 'can_block': 'Si les complica la vida, se muere.', 'angles': []},
        {'key': 'hotel-guest-experience', 'name': 'Guest experience', 'role': 'influenciador', 'goals': 'Que la experiencia del huésped sea buena.',
         'pains': None, 'kpis': 'Reseñas.', 'objections': [], 'how_to_approach': 'Le interesan las reseñas.', 'avoid': None, 'can_help': None, 'can_block': None, 'angles': []},
        {'key': 'hotel-direccion', 'name': 'Dirección del hotel', 'role': 'pagador', 'goals': None, 'pains': None, 'kpis': None,
         'objections': ['precio', 'no_decido_yo'], 'how_to_approach': 'Firma lo que cuesta dinero. Decide en cadenas; en hoteles pequeños, a veces directamente.',
         'avoid': None, 'can_help': None, 'can_block': None, 'angles': []},
        {'key': 'hotel-marketing', 'name': 'Marketing y redes', 'role': 'influenciador', 'goals': 'Instagram, Booking, TripAdvisor.', 'pains': None,
         'kpis': 'Reseñas y contenido.', 'objections': [], 'how_to_approach': 'El contenido es suyo.', 'avoid': None, 'can_help': None, 'can_block': None, 'angles': []},
    ],
}
t['market'] = [s for s in t['market'] if s['key'] != 'hoteles']
at = next((i for i, s in enumerate(t['market']) if s['key'] == 'bodas'), len(t['market']))  # bodas, siempre la última
t['market'].insert(at, SEGMENT)

# ---------------------------------------------------------------- jugadas
plays = {p['key']: p for p in t['playbook']}


def play(key, kind, stage, title, body, audience='all', objection=None):
    base = {'key': key, 'module_key': None, 'kind': kind, 'stage': stage, 'objection': objection, 'segments': ['hoteles'],
            'personas': [], 'audience': audience, 'about': False, 'pinned': None, 'title': title, 'body': body,
            'when_to_use': None, 'why_it_works': None, 'technique_refs': [], 'status': 'official'}
    if key in plays:
        plays[key].update({k: base[k] for k in ('kind', 'stage', 'objection', 'audience', 'title', 'body')})
    else:
        t['playbook'].append(base)
        plays[key] = base


play('hotel-tesis', 'fit', 'descubrimiento', 'La tesis, en una página', (
    '**El cliente ideal es el sitio del que la gente no sale.** Resort all-inclusive, hotel vacacional alejado del centro. Mucha gente, en el '
    'mismo sitio, durante muchos días, con todo pagado.\n\n**Su problema no es el dinero: es llenar el tiempo.** Un equipo de animación de seis '
    'personas tiene que entretener a los mismos huéspedes durante siete o catorce días seguidos, y cuando se acaba el repertorio se repite. El '
    'huésped que se aburre no se queja: se va y pone una reseña tibia.\n\n**Por eso aquí no vendemos monetización, vendemos satisfacción y '
    'contenido.** Y el programa de animación lo reciben todos los departamentos del hotel: lo que entra en animación lo ve toda la casa.\n\n'
    '*Tesis sin validar, con fuentes en el documento 14.*'))

play('hotel-gratis', 'script', 'pitch_demo', 'Gratis para el huésped, y dilo pronto', (
    '**La monetización no se menciona.** El huésped lleva pulsera de todo incluido: no va a pagar por una canción, y plantearlo te deja como '
    'alguien que no entiende el negocio. Lo que sí se dice, pronto:\n\n> ' + GRATIS))

play('hotel-ajuste-gratis', 'tip', 'mentalidad', 'Nota interna: el ajuste que bloquea el gratuito', (
    'Existe un ajuste que deja el sistema bloqueado en gratuito e impide poner precio desde dentro, para que nadie del equipo de animación '
    'acabe cobrándole a un huésped por error. **No se vende ni se menciona:** es configuración nuestra, no una funcionalidad.'), audience='team')

play('hotel-avisos', 'tip', 'prospeccion', 'Antes de la primera reunión', (
    '| Qué | Por qué importa |\n|---|---|\n'
    '| **Conectividad** | En un resort hay wifi, pero no siempre en todas las zonas. Se comprueba antes |\n'
    '| **Validación manual** | Todo lo que sale en pantalla lo valida alguien: una persona del equipo de animación con el móvil |\n\n'
    '**Resuelto, y es parte del argumento:**\n\n- **Idioma:** cada huésped lo ve en el suyo; la app detecta el del móvil. En un resort con seis '
    'nacionalidades no es un detalle.\n- **Varias zonas:** pantallas distintas con contenido propio (piscina, buffet, teatro). Se vende como disponible.\n\n'
    '**Cruceros: se dejan para después.** La conectividad a bordo cambia el producto y nadie la ha mirado. Si salen, se escuchan; no se proponen.'))

play('hotel-nunca', 'tip', 'mentalidad', 'Lo que no se dice en hoteles', (
    '| Qué | Por qué |\n|---|---|\n'
    '| **Que se puede cobrar a los huéspedes** | All-inclusive. Te deja fuera de juego |\n'
    '| **El ajuste que bloquea el gratuito** | Es configuración nuestra, no una funcionalidad que vender |\n'
    '| **Cualquier precio** | No hay tarifa para este sector |\n'
    '| **Cruceros** | Hasta que sepamos lo de la conectividad |\n'
    '| **Que va automático** | Todo lleva validación manual |\n'
    '| **CRM, remarketing, datos de huéspedes** | Roadmap |\n'
    '| **Nombres de clientes** | No tenemos ninguno en este sector |'))

play('hotel-traer', 'tip', 'seguimiento', 'Qué queremos saber de cada conversación', (
    'El objetivo no es vender: es saber si la vertical existe.\n\n'
    '1. **¿Quién decidió escuchar?** ¿Animación, dirección, marketing?\n'
    '2. **¿Cuál fue su primera reacción?** ¿Qué le interesó: el entretenimiento, el contenido o las reseñas?\n'
    '3. **¿Qué pantallas tienen y en qué zonas?**\n'
    '4. **¿Qué presupuesto maneja animación y quién lo firma?**\n'
    '5. **¿Qué le preocupó?** La objeción literal.\n'
    '6. **¿Hay salón de eventos?** Puede ser la entrada aunque animación no compre.\n\n'
    '**Con cinco conversaciones así sabremos si esto es una vertical o una distracción.**'))

play('hotel-pendientes', 'tip', 'mentalidad', 'Pendientes de hoteles', (
    '| Qué | Estado |\n|---|---|\n| Tarifa para el sector | No existe. Hasta tenerla, el dossier va sin precio |\n'
    '| Conectividad en cruceros | Sin mirar |\n\nNada de esto frena a Ángel: puede empezar a enseñar el dossier ya.'), audience='team')

P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print('hoteles: sector nuevo,', len(proposal['blocks']), 'diapositivas,', len(SEGMENT['personas']), 'actores')
