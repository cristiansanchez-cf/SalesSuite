-- CRM dinámico (docs/CRM_DINAMICO.md): los campos los define el admin y los lee el equipo; en la cuenta solo se guardan
-- claves de campos del espacio; el comercial rellena la ficha de las cuentas que trabaja.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.crm_field (tenant_id, key, label, type) values ('00000000-0000-4000-8000-000000000e01', 'tiene-pantalla', '¿Tiene pantalla?', 'checkbox');
insert into public.crm_field (tenant_id, key, label, type, options) values
  ('00000000-0000-4000-8000-000000000e01', 'noches', 'Noches', 'multi_select', '[{"key":"viernes","label":"Viernes"},{"key":"sabado","label":"Sábado"}]');
insert into public.account (id, tenant_id, name, fields) values
  ('47000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Sala CRM', '{"tiene-pantalla": true}');
select pg_temp.assert((select (fields->>'tiene-pantalla')::boolean from public.account where name = 'Sala CRM'), 'el admin guarda un valor');
do $$ begin
  update public.account set fields = '{"inventado": 1}' where name = 'Sala CRM';
  raise exception 'ASSERT FAILED: clave que no es un campo';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.crm_field (tenant_id, key, label, type) values ('00000000-0000-4000-8000-000000000e01', 'Mal Clave', 'X', 'text');
  raise exception 'ASSERT FAILED: clave con mayúsculas y espacios';
exception when check_violation then null; end $$;
update public.account set owner_id = '11111111-1111-4111-8111-111111111111', claimed_until = now() + interval '10 days' where name = 'Sala CRM';

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
select pg_temp.assert((select count(*) from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01') = 2, 'el comercial ve los campos');
do $$ begin
  insert into public.crm_field (tenant_id, key, label, type) values ('00000000-0000-4000-8000-000000000e01', 'mio', 'Mío', 'text');
  raise exception 'ASSERT FAILED: un comercial define campos';
exception when insufficient_privilege then null; end $$;
update public.crm_field set label = 'Hackeado' where key = 'noches';
select pg_temp.assert((select label from public.crm_field where key = 'noches') = 'Noches', 'un comercial no cambia campos (RLS: 0 filas)');
update public.account set fields = '{"tiene-pantalla": true, "noches": ["viernes"]}' where name = 'Sala CRM';
select pg_temp.assert((select fields->'noches' ? 'viernes' from public.account where name = 'Sala CRM'), 'quien trabaja la cuenta rellena su ficha');
reset role;

-- Otro espacio no ve los campos de Enjoy.
select pg_temp.assert((select count(*) from public.crm_field where tenant_id <> '00000000-0000-4000-8000-000000000e01') = 0, 'nada fuera de Enjoy');
delete from public.account where name = 'Sala CRM';
delete from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01';
