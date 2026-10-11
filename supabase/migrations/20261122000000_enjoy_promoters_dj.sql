-- Ficha de la empresa, ronda con Cristian (11-oct-2026):
-- 1) Las promotoras tienen su pestaña aparte en Enjoy, como los DJs. Las del sector «Promotoras» pasan a ese tipo.
-- 2) «¿Tiene DJ residente?» (casilla de la ficha) pasa a la Cualificación, que distingue residente, invitados o los
--    dos. Se archiva el campo (se recupera en Campos; los valores no se borran) y lo marcado pasa a «DJ: residente».
do $$
declare t uuid; f record;
begin
  select id into t from public.tenant where slug = 'enjoy';
  if t is null then return; end if;

  insert into public.crm_settings (tenant_id) values (t) on conflict (tenant_id) do nothing;
  update public.crm_settings
     set kinds = kinds || '[{"key":"promotora","label":"Promotora","plural":"Promotoras","icon":"ticket"}]'::jsonb
   where tenant_id = t and not exists (select 1 from jsonb_array_elements(kinds) k where k ->> 'key' = 'promotora')
     and jsonb_array_length(kinds) < 12;
  update public.account a
     set kind = 'promotora'
    from public.segment s
   where a.tenant_id = t and s.tenant_id = t and a.segment_id = s.id and s.key = 'promotoras' and a.kind = 'company'
     and exists (select 1 from public.crm_settings c, jsonb_array_elements(c.kinds) k where c.tenant_id = t and k ->> 'key' = 'promotora');

  for f in
    select c.id, c.key from public.crm_field c
    where c.tenant_id = t and c.type = 'checkbox' and c.archived_at is null
      and (c.key ~ '^dj-residente$' or c.label ~* '^¿?tiene dj residente\??$')
  loop
    update public.account a
       set qualification = a.qualification || '{"dj":"resident"}'::jsonb
     where a.tenant_id = t and (a.fields -> f.key) = 'true'::jsonb and not (a.qualification ? 'dj');
    update public.crm_field set archived_at = now() where id = f.id;
  end loop;
end $$;
