-- Ordenar ciudades (docs/CRM_DINAMICO.md §14): mover empresas en bloque solo admin o gerente, solo a zonas del mismo
-- espacio; los arreglos (con su deshacer) solo los ven los managers de su espacio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.zone (id, tenant_id, name, kind) values
  ('52000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'Ciudad 52 vieja', 'city'),
  ('52000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000e01', 'Ciudad 52 buena', 'city');
insert into public.account (id, tenant_id, name, zone_id) values
  ('52000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Empresa 52', '52000000-0000-4000-8000-0000000000b1');
select pg_temp.assert(public.crm_move_accounts('00000000-0000-4000-8000-000000000e01',
  '[{"id":"52000000-0000-4000-8000-0000000000a1","zone":"52000000-0000-4000-8000-0000000000b2","notes":"Ciudad en el Notion: x","tags":["revisar-ciudad"]}]') = 1, 'el admin mueve');
select pg_temp.assert((select zone_id = '52000000-0000-4000-8000-0000000000b2' and notes = 'Ciudad en el Notion: x' and tags = '{revisar-ciudad}' from public.account where id = '52000000-0000-4000-8000-0000000000a1'), 'zona, nota y lista');
insert into public.crm_fix (tenant_id, kind, summary, undo) values ('00000000-0000-4000-8000-000000000e01', 'zones', '{"moved":1}', '{}');
select pg_temp.assert((select count(*) from public.crm_fix where tenant_id = '00000000-0000-4000-8000-000000000e01') >= 1, 'el admin guarda el arreglo');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
do $$ begin
  perform public.crm_move_accounts('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: un comercial mueve en bloque';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert((select count(*) from public.crm_fix) = 0, 'un comercial no ve los arreglos');

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- admin de otro espacio
do $$ begin
  perform public.crm_move_accounts('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: otro espacio mueve';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  perform public.crm_move_accounts('00000000-0000-4000-8000-000000000e01', '[{"id":"52000000-0000-4000-8000-0000000000a1","zone":"00000000-0000-4000-8000-0000000000ff"}]');
  raise exception 'ASSERT FAILED: mueve a una zona que no es suya';
exception when check_violation then null; end $$;
reset role;
delete from public.crm_fix where tenant_id = '00000000-0000-4000-8000-000000000e01';
delete from public.account where id = '52000000-0000-4000-8000-0000000000a1';
delete from public.zone where id in ('52000000-0000-4000-8000-0000000000b1', '52000000-0000-4000-8000-0000000000b2');
