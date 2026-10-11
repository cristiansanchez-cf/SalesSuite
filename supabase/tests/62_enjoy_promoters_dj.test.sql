-- Migración 20261122: pestaña Promotoras en Enjoy (las del sector pasan a ella) y «DJ residente» a la cualificación.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.crm_settings (tenant_id, kinds) values ('00000000-0000-4000-8000-000000000e01',
  '[{"key":"company","label":"Empresa","plural":"Empresas","icon":"building2"},{"key":"dj","label":"DJ o artista","plural":"DJs","icon":"music"}]')
on conflict (tenant_id) do update set kinds = excluded.kinds;
insert into public.segment (id, tenant_id, key, name) select '62000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'promotoras', 'Promotoras'
  where not exists (select 1 from public.segment where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'promotoras');
insert into public.crm_field (tenant_id, key, label, type) values ('00000000-0000-4000-8000-000000000e01', 'dj-residente', '¿Tiene DJ residente?', 'checkbox');
insert into public.account (id, tenant_id, name, segment_id, fields, qualification) values
  ('62000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Promo 62', (select id from public.segment where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'promotoras'), '{}', '{}'),
  ('62000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Con DJ 62', null, '{"dj-residente": true}', '{}'),
  ('62000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000e01', 'DJ invitados 62', null, '{"dj-residente": true}', '{"dj": "guests"}');
\i supabase/migrations/20261122000000_enjoy_promoters_dj.sql
\i supabase/migrations/20261122000000_enjoy_promoters_dj.sql
select pg_temp.assert((select count(*) = 1 from public.crm_settings c, jsonb_array_elements(c.kinds) k where c.tenant_id = '00000000-0000-4000-8000-000000000e01' and k ->> 'key' = 'promotora'), 'tipo Promotora, una vez aunque se repita');
select pg_temp.assert((select kind = 'promotora' from public.account where id = '62000000-0000-4000-8000-0000000000a1'), 'las del sector Promotoras, a su pestaña');
select pg_temp.assert((select kind = 'company' from public.account where id = '62000000-0000-4000-8000-0000000000a2'), 'las demás no cambian de tipo');
select pg_temp.assert((select qualification ->> 'dj' = 'resident' from public.account where id = '62000000-0000-4000-8000-0000000000a2'), 'DJ residente pasa a la cualificación');
select pg_temp.assert((select qualification ->> 'dj' = 'guests' from public.account where id = '62000000-0000-4000-8000-0000000000a3'), 'no pisa lo que ya tenía');
select pg_temp.assert((select archived_at is not null from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'dj-residente'), 'campo archivado');
select pg_temp.assert(public.crm_kind_ok('00000000-0000-4000-8000-000000000e01', 'promotora'), 'el tipo vale para clasificar');
delete from public.account where id::text like '62000000-%';
delete from public.segment where id = '62000000-0000-4000-8000-0000000000b1';
delete from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'dj-residente';
