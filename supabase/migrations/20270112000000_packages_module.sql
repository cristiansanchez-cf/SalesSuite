-- Paquetes en las propuestas (docs/PAQUETES.md): el módulo «Paquetes» (packages-offer) en el catálogo de Enjoy. Lo
-- pone el comercial desde el editor de la propuesta («Paquetes»): una foto del catálogo con lo que incluye cada uno y el
-- total, antes del precio.
do $$
declare t uuid; m uuid;
begin
  select id into t from public.tenant where slug = 'enjoy';
  if t is null then return; end if;
  insert into public.module (tenant_id, key, block_type, name, description, is_catalog)
  values (t, 'paquetes', 'packages-offer', 'Paquetes', 'Los paquetes que le propones, con lo que incluye cada uno y el total.', true)
  on conflict (tenant_id, key) do nothing
  returning id into m;
  if m is null then return; end if;
  insert into public.module_version (tenant_id, module_id, version, default_props, status)
  values (t, m, 1, '{"eyebrow": "Para {company}", "title": "Lo que te proponemos", "subtitle": "Elige lo que quieres en tu local. Lo normal: 3 o 4 paquetes."}'::jsonb, 'published');
end $$;
