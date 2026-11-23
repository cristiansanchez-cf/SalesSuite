-- Decks (docs/DECKS.md): más bloques interactivos (el ciclo del producto clicable, el embudo de mercado, la tabla de
-- competencia y la calculadora), como bloques de partida en los espacios con la sección activada. Textos genéricos: cada
-- espacio los rellena con lo suyo. No pisa nada (si la clave ya existe, no se toca).
do $$
declare
  t record;
  b record;
  m uuid;
begin
  for t in select x.tenant_id as id from public.tenant_feature x where x.decks loop
    for b in select * from (values
      ('deck-ciclo', 'deck-cycle', 'Deck · El ciclo del producto', '{"eyebrow":"La solución","title":"Una plataforma. *Todo el ciclo.*","steps":[{"label":"Descubrir","pillars":[1]},{"label":"Reservar","pillars":[2]},{"label":"Repetir","pillars":[3]}],"pillars":[{"title":"Pilar uno","text":"Qué hace.","state":"available"},{"title":"Pilar dos","text":"Qué hace.","state":"building"},{"title":"Pilar tres","text":"Qué hace.","state":"roadmap"}]}'::jsonb),
      ('deck-embudo', 'deck-funnel', 'Deck · Embudo de mercado', '{"eyebrow":"Mercado","title":"El tamaño de la oportunidad","levels":[{"value":"—","label":"Mercado total"},{"value":"—","label":"Al que llegamos"},{"value":"—","label":"Lo que queremos en 3 años"}]}'::jsonb),
      ('deck-competencia-tabla', 'deck-matrix', 'Deck · Tabla de competencia', '{"eyebrow":"Competencia","title":"Un mercado de *soluciones parciales*","columns":["Nosotros","Competidor"],"rows":[{"label":"Funcionalidad","cells":["yes","no"]}]}'::jsonb),
      ('deck-calculadora', 'deck-calc', 'Deck · Calculadora', '{"eyebrow":"Haz la cuenta","title":"Lo que obtienes con *tu ticket*","kind":"stake","postMoney":1000000}'::jsonb)
    ) as x(key, block_type, name, props) loop
      m := null;
      insert into public.module (tenant_id, key, block_type, name, description, is_catalog)
      values (t.id, b.key, b.block_type, b.name, 'Bloque de deck de inversión: edítalo con lo vuestro.', true)
      on conflict (tenant_id, key) do nothing
      returning id into m;
      if m is not null then
        insert into public.module_version (tenant_id, module_id, version, default_props, status) values (t.id, m, 1, b.props, 'published');
      end if;
    end loop;
  end loop;
end $$;
