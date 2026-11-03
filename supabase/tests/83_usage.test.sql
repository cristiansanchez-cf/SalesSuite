-- Consumo por empresa: nadie con sesión lo lee ni lo escribe; el superadmin lo ve agrupado (platform_usage).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('a8a8a8a8-0000-4000-8000-000000000003', 'super.usage@cofundo.test');
insert into public.platform_admin (user_id) values ('a8a8a8a8-0000-4000-8000-000000000003');
insert into public.usage_event (tenant_id, user_id, feature, provider, model, input_tokens, output_tokens, cost_usd) values
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'crm.notes', 'anthropic', 'claude-haiku-5-5', 1000, 200, 0.0002),
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'crm.notes', 'anthropic', 'claude-haiku-5-5', 3000, 400, 0.0005);
insert into storage.objects (bucket_id, name, metadata) values
  ('tenant-assets', '00000000-0000-4000-8000-000000000e01/foto-1.jpg', '{"size": 1500}'),
  ('tenant-assets', '00000000-0000-4000-8000-000000000e01/foto-2.jpg', '{"size": 500}');

set role authenticated;
-- Un admin del espacio: ni la tabla ni las funciones.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin perform 1 from public.usage_event; raise exception 'ASSERT FAILED: el admin lee usage_event'; exception when insufficient_privilege then null; end;
  begin insert into public.usage_event (feature, provider) values ('x', 'other'); raise exception 'ASSERT FAILED: el admin escribe usage_event'; exception when insufficient_privilege then null; end;
  begin perform * from public.platform_usage(now() - interval '1 day', now() + interval '1 day'); raise exception 'ASSERT FAILED: el admin ve el consumo'; exception when insufficient_privilege then null; end;
  begin perform * from public.platform_storage(); raise exception 'ASSERT FAILED: el admin ve el almacenamiento'; exception when insufficient_privilege then null; end;
end $$;
-- El superadmin: agrupado.
set request.jwt.claim.sub = 'a8a8a8a8-0000-4000-8000-000000000003';
select pg_temp.assert((select events = 2 and input_tokens = 4000 and cost_usd = 0.0007 and user_name is not null from public.platform_usage(now() - interval '1 day', now() + interval '1 day')
  where tenant_id = '00000000-0000-4000-8000-000000000e01' and feature = 'crm.notes'), 'el superadmin ve el consumo agrupado');
select pg_temp.assert((select bytes = 2000 and objects >= 2 from public.platform_storage() where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'y lo que ocupa cada espacio');
reset role;
delete from public.usage_event where feature = 'crm.notes';
delete from storage.objects where name like '00000000-0000-4000-8000-000000000e01/foto-%';
delete from public.platform_admin where user_id = 'a8a8a8a8-0000-4000-8000-000000000003';
