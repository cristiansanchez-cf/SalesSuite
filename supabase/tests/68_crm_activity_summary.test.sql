-- Migración 20261129: resumen de interacciones por empresa (para el tablero).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.account (id, tenant_id, name) values ('68000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Tablero 68');
insert into public.crm_activity (tenant_id, account_id, channel, outcome, happened_at) values
  ('00000000-0000-4000-8000-000000000e01', '68000000-0000-4000-8000-0000000000a1', 'whatsapp', 'no_reply', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000e01', '68000000-0000-4000-8000-0000000000a1', 'whatsapp', 'replied', '2026-09-05'),
  ('00000000-0000-4000-8000-000000000e01', '68000000-0000-4000-8000-0000000000a1', 'visit', 'interested', '2026-09-10'),
  ('00000000-0000-4000-8000-000000000e01', '68000000-0000-4000-8000-0000000000a1', 'other', 'note', '2026-09-12');
select pg_temp.assert((select real = 3 and first_at::date = '2026-09-01' and first_reply_at::date = '2026-09-05' and last_at::date = '2026-09-12' and last_outcome = 'interested'
  from public.crm_activity_summary where account_id = '68000000-0000-4000-8000-0000000000a1'), 'resumen: 3 de verdad, primera, primera respuesta, última y lo último que pasó (sin notas)');
select pg_temp.assert((select relkind = 'v' and reloptions::text like '%security_invoker=true%' from pg_class where relname = 'crm_activity_summary'), 'vista con los permisos de quien lee');
delete from public.account where id = '68000000-0000-4000-8000-0000000000a1';
\echo '68_crm_activity_summary OK'
