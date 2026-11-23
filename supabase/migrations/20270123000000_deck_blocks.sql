-- Decks (docs/DECKS.md): bloques nuevos (la oportunidad en hitos, por qué entrar ahora, el cierre con contacto y los
-- acuerdos cerrados con foto), como bloques de partida en los espacios con la sección activada. Textos genéricos: cada
-- espacio los rellena con lo suyo. No pisa nada (si la clave ya existe, no se toca).
do $$
declare
  t record;
  b record;
  m uuid;
begin
  for t in select x.tenant_id as id from public.tenant_feature x where x.decks loop
    for b in select * from (values
      ('deck-oportunidad', 'deck-timeline', 'Deck · La oportunidad', '{"eyebrow":"Por qué esta inversión","title":"El modelo funciona. *La ronda acelera.*","quote":"Qué compra esta ronda y cuándo los ingresos propios financian el crecimiento.","steps":[{"when":"Hoy","value":"—","label":"clientes"},{"when":"Final de año","value":"—","label":"clientes"},{"when":"Break-even","value":"—","label":"clientes","highlight":true},{"when":"En 2 años","value":"—","label":"clientes"}]}'::jsonb),
      ('deck-ventajas', 'deck-math', 'Deck · Por qué entrar ahora', '{"eyebrow":"Tus ventajas","title":"Por qué tiene sentido *entrar ahora.*","cardsTitle":"Cuándo podrías *salir y recuperar la inversión.*","cards":[{"tag":"Primera ventana de salida","title":"Segunda ronda","text":"Qué pasa y cuándo."},{"tag":"Segunda ventana de salida","title":"Compra por un actor estratégico","text":"Quién podría comprar y cuándo."}]}'::jsonb),
      ('deck-contacto', 'deck-contact', 'Deck · Contacto', '{"eyebrow":"Contacto","title":"¿Quieres *entrar?*","people":[{"role":"CEO","name":"Nombre Apellido","contact":"hola@tuempresa.com"}]}'::jsonb),
      ('deck-casos', 'deck-cases', 'Deck · Acuerdos cerrados', '{"eyebrow":"Tres acuerdos","title":"Lo que *hemos cerrado.*","items":[{"status":"Cerrado","title":"Nombre del acuerdo","meta":"Cuándo · dónde","text":"Qué es y por qué importa."}]}'::jsonb)
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
