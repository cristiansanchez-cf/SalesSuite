-- Migración 20261127: la última interacción (no nota) por empresa, con los permisos de crm_activity.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.account (id, tenant_id, name) values ('66000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Ultima 66');
insert into public.crm_activity (tenant_id, account_id, channel, outcome, happened_at) values
  ('00000000-0000-4000-8000-000000000e01', '66000000-0000-4000-8000-0000000000a1', 'phone', 'no_reply', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000e01', '66000000-0000-4000-8000-0000000000a1', 'whatsapp', 'replied', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000e01', '66000000-0000-4000-8000-0000000000a1', 'other', 'note', now() - interval '1 day');
select pg_temp.assert((select count(*) = 1 and min(outcome) = 'replied' from public.crm_last_activity where account_id = '66000000-0000-4000-8000-0000000000a1'),
  'una fila por empresa: la última que no es nota');
select pg_temp.assert((select relkind = 'v' and reloptions::text like '%security_invoker=true%' from pg_class where relname = 'crm_last_activity'), 'vista con los permisos de quien lee');
delete from public.account where id = '66000000-0000-4000-8000-0000000000a1';
\echo '66_crm_last_activity OK'
