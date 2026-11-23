-- El deck de Enjoy (docs/DECKS.md): sus bloques de inversión con lo que ya está escrito de Enjoy (qué es, la visión,
-- por qué ahora, cómo gana dinero, lo que no es), sacado de tenants/enjoy/tenant.json y docs/ventas/enjoy.
-- Las cifras (mercado, tracción, la ronda) y el equipo siguen como huecos «—»: se rellenan en el Catálogo con datos reales.
-- Una versión nueva de cada bloque, solo si nadie lo ha editado todavía (sigue en la versión 1).
do $$
declare
  t uuid;
  b record;
  m uuid;
begin
  select id into t from public.tenant where slug = 'enjoy';
  if t is null then return; end if;

  for b in select * from (values
    ('deck-portada', jsonb_build_object(
      'eyebrow', 'Para {company}',
      'title', 'Enjoy the Club',
      'tagline', 'El público escanea un QR, sin descargar nada, y sube fotos, manda mensajes y pide canciones que salen en la pantalla.',
      'round', '—')),
    ('deck-problema', jsonb_build_object(
      'eyebrow', 'El problema',
      'title', 'La gente sale menos y, cuando sale, está con el móvil',
      'lede', 'Pelearse contra eso es perder. Y a la vez, el sector tiene tres problemas que nadie le resuelve.',
      'bullets', jsonb_build_array(
        'El ocio nocturno se copia a sí mismo: las mismas fiestas, la misma música, los mismos carteles. Diferenciarse ya no es una ventaja, es una condición.',
        'Los locales necesitan contenido para redes cada semana y lo hace el encargado con el móvil a las cuatro de la mañana.',
        'Las marcas que patrocinan exigen medir lo que compran, y una activación física no les entrega nada.'))),
    ('deck-solucion', jsonb_build_object(
      'eyebrow', 'La solución',
      'title', 'Que lo que hacen con el móvil pase en la sala',
      'bullets', jsonb_build_array(
        'Un QR, sin descargar nada: fotos, mensajes y peticiones de canciones en la pantalla, en directo.',
        'Quien organiza lo controla todo desde su móvil: qué sale en pantalla y qué canciones se pueden pedir.',
        'Un álbum de la noche con las fotos de su propio público, con permiso de uso comercial: contenido para sus redes.',
        'Analítica de participación para quien contrata y para las marcas que patrocinan.',
        'Pantalla en navegador o Smart TV, o sobre los visuales que ya hay (NDI); varias pantallas con contenido distinto.'),
      'note', 'Está en producción y se puede enseñar.')),
    ('deck-mercado', jsonb_build_object(
      'eyebrow', 'Mercado',
      'title', 'El tamaño de la oportunidad',
      'lede', 'Locales de ocio nocturno, promotoras, conciertos, festivales, hoteles y bodas: cada uno con su forma de comprar.',
      'stats', jsonb_build_array(
        jsonb_build_object('value', '—', 'label', 'TAM', 'note', 'Mercado total'),
        jsonb_build_object('value', '—', 'label', 'SAM', 'note', 'Al que llegamos'),
        jsonb_build_object('value', '—', 'label', 'SOM', 'note', 'Lo que queremos en 3 años')))),
    ('deck-modelo', jsonb_build_object(
      'eyebrow', 'Modelo de negocio',
      'title', 'Cobramos por el servicio, no por el consumo de su público',
      'bullets', jsonb_build_array(
        'Locales: cuota mensual por aforo (99 €, 249 € o 499 € al mes).',
        'Conciertos, festivales y promotoras: precio por evento, de 90 € a 2.500 €.',
        'Suscripción cuando hay recurrencia: promotoras, agencias y recintos de temporada.',
        'Activaciones de marca en festivales, desde 3.000 €: la marca paga y el festival deja de verlo como un gasto.',
        'Lo que paga el público por sus peticiones va a la cuenta del local.'))),
    ('deck-competencia', jsonb_build_object(
      'eyebrow', 'Por qué nosotros',
      'title', 'Lo que no somos',
      'bullets', jsonb_build_array(
        'No somos una kiss cam: sale quien quiere salir, y al subir su foto acepta los términos.',
        'No somos una app de peticiones para DJs: es una parte, y la que menos vendemos. Con el menú cerrado, nadie le toca el repertorio al DJ.',
        'No somos una agencia de contenido ni montamos nada físico: el contenido lo hace su propio público.',
        'Cada noche encendida deja datos que nadie más tiene: qué se pide, dónde, a qué hora y con qué público.')))
  ) as x(key, props) loop
    select id into m from public.module where tenant_id = t and key = b.key;
    if m is null then continue; end if;
    if exists (select 1 from public.module_version v where v.module_id = m and v.version > 1) then continue; end if;
    insert into public.module_version (tenant_id, module_id, version, default_props, status)
    values (t, m, 2, b.props, 'published')
    on conflict do nothing;
  end loop;
end $$;
