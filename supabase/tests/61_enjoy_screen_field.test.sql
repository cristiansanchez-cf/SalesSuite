-- Migración 20261121: en Enjoy, «¿Tiene pantalla?» se archiva y lo marcado pasa a la cualificación (sin pisar nada).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.crm_field (tenant_id, key, label, type) values ('00000000-0000-4000-8000-000000000e01', 'tiene-pantalla', '¿Tiene pantalla?', 'checkbox');
insert into public.account (id, tenant_id, name, fields, qualification) values
  ('61000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Con pantalla 61', '{"tiene-pantalla": true}', '{}'),
  ('61000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Ya cualificada 61', '{"tiene-pantalla": true}', '{"screens": "wants"}'),
  ('61000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000e01', 'Sin marcar 61', '{}', '{}');
\i supabase/migrations/20261121000000_enjoy_screen_field.sql
select pg_temp.assert((select qualification ->> 'screens' = 'yes' from public.account where id = '61000000-0000-4000-8000-0000000000a1'), 'lo marcado pasa a la cualificación');
select pg_temp.assert((select qualification ->> 'screens' = 'wants' from public.account where id = '61000000-0000-4000-8000-0000000000a2'), 'no pisa lo que ya tenía');
select pg_temp.assert((select not (qualification ? 'screens') from public.account where id = '61000000-0000-4000-8000-0000000000a3'), 'sin marcar: no se sabe');
select pg_temp.assert((select archived_at is not null from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'tiene-pantalla'), 'campo archivado');
select pg_temp.assert((select fields ? 'tiene-pantalla' from public.account where id = '61000000-0000-4000-8000-0000000000a1'), 'los valores no se borran');
delete from public.account where id::text like '61000000-%';
delete from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'tiene-pantalla';
