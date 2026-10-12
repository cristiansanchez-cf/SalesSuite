-- Migración 20261128: el aforo en número pasa a su tramo de tamaño (según local / conciertos / festival) y se archiva.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.crm_field (tenant_id, key, label, type) values ('00000000-0000-4000-8000-000000000e01', 'aforo', 'Aforo', 'number')
  on conflict (tenant_id, key) do update set archived_at = null, type = 'number';
insert into public.account (id, tenant_id, name, fields, qualification) values
  ('67000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Local 67', '{"aforo": 300}', '{"format": ["club"]}'),
  ('67000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Festi 67', '{"aforo": 4000}', '{"format": ["festival"]}'),
  ('67000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000e01', 'Sala 67', '{"aforo": 4000}', '{"format": "concerts"}'),
  ('67000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000e01', 'Ya 67', '{"aforo": 4000}', '{"size": "small"}');
\i supabase/migrations/20261128000000_enjoy_size_capacity.sql
select pg_temp.assert((select qualification ->> 'size' = 'medium' from public.account where id = '67000000-0000-4000-8000-0000000000a1'), 'local de 300: mediano');
select pg_temp.assert((select qualification ->> 'size' = 'small' from public.account where id = '67000000-0000-4000-8000-0000000000a2'), 'festival de 4.000: pequeño');
select pg_temp.assert((select qualification ->> 'size' = 'large' from public.account where id = '67000000-0000-4000-8000-0000000000a3'), 'conciertos de 4.000: grande');
select pg_temp.assert((select qualification ->> 'size' = 'small' from public.account where id = '67000000-0000-4000-8000-0000000000a4'), 'lo que ya tenía no se pisa');
select pg_temp.assert((select archived_at is not null from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01' and key = 'aforo'), 'campo archivado');
delete from public.account where id::text like '67000000-%';
\echo '67_enjoy_size_capacity OK'
