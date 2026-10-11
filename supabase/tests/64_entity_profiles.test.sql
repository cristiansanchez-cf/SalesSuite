-- Migración 20261125: en Enjoy, DJs con ficha de DJ y Promotoras con ficha de promotora (el resto, igual).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.crm_settings (tenant_id, kinds) values ('00000000-0000-4000-8000-000000000e01',
  '[{"key":"company","label":"Empresa","plural":"Empresas","icon":"building2"},{"key":"dj","label":"DJ o artista","plural":"DJs","icon":"music"},{"key":"promotora","label":"Promotora","plural":"Promotoras","icon":"ticket"}]')
on conflict (tenant_id) do update set kinds = excluded.kinds;
-- Solo la parte de datos de la migración (las columnas ya existen).
update public.crm_settings c
   set kinds = (select jsonb_agg(case when k ->> 'key' = 'dj' then k || '{"profile":"dj"}'::jsonb
                                      when k ->> 'key' = 'promotora' then k || '{"profile":"promoter"}'::jsonb
                                      else k end order by o)
                  from jsonb_array_elements(c.kinds) with ordinality e(k, o))
  from public.tenant t
 where t.id = c.tenant_id and t.slug = 'enjoy' and jsonb_array_length(c.kinds) > 0;
select pg_temp.assert((select kinds -> 1 ->> 'profile' = 'dj' and kinds -> 2 ->> 'profile' = 'promoter' and not (kinds -> 0 ? 'profile') and kinds -> 0 ->> 'key' = 'company'
  from public.crm_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'perfiles puestos, en orden');
