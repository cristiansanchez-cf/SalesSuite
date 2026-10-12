-- Migración 20261202: unir dos empresas. Pasan las personas y enlaces elegidos y todo el historial; la otra se borra.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.account (id, tenant_id, name, place_id) values
  ('71000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Mya 71', null),
  ('71000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Mya Valencia 71', 'place-71'),
  ('71000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000e01', 'Promotora 71', null),
  ('71000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000e01', 'Local de Mya 71', null),
  ('71000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-000000000e01', 'Otro 71', null);
update public.account set parent_id = '71000000-0000-4000-8000-0000000000a2' where id = '71000000-0000-4000-8000-0000000000a4';
insert into public.crm_contact (id, tenant_id, name) values
  ('71000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000e01', 'Lucía 71'),
  ('71000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000e01', 'Pepe 71');
insert into public.crm_contact_account (tenant_id, contact_id, account_id, role) values
  ('00000000-0000-4000-8000-000000000e01', '71000000-0000-4000-8000-0000000000c1', '71000000-0000-4000-8000-0000000000a2', 'Gerente'),
  ('00000000-0000-4000-8000-000000000e01', '71000000-0000-4000-8000-0000000000c2', '71000000-0000-4000-8000-0000000000a2', 'Camarero');
insert into public.account_link (tenant_id, a_id, b_id) values
  ('00000000-0000-4000-8000-000000000e01', '71000000-0000-4000-8000-0000000000a2', '71000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-000000000e01', '71000000-0000-4000-8000-0000000000a2', '71000000-0000-4000-8000-0000000000a5');
insert into public.crm_activity (tenant_id, account_id, channel, outcome, note) values
  ('00000000-0000-4000-8000-000000000e01', '71000000-0000-4000-8000-0000000000a2', 'visit', 'replied', 'Hablé con el encargado');

-- Un comercial no une empresas que no son suyas.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- comercial de Enjoy
do $$ begin
  perform public.account_merge('71000000-0000-4000-8000-0000000000a1', '71000000-0000-4000-8000-0000000000a2', '{}', '{}', false);
  raise exception 'ASSERT FAILED: el comercial une empresas libres de otros';
exception when insufficient_privilege then null; end $$;

-- El admin: se queda a1 con Lucía (no Pepe), la promotora (no «Otro») y la ficha de Google de a2.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
select public.account_merge('71000000-0000-4000-8000-0000000000a1', '71000000-0000-4000-8000-0000000000a2',
  array['71000000-0000-4000-8000-0000000000c1']::uuid[], array['71000000-0000-4000-8000-0000000000a3']::uuid[], true);
reset role;
select pg_temp.assert((select count(*) = 0 from public.account where id = '71000000-0000-4000-8000-0000000000a2'), 'la otra, borrada');
select pg_temp.assert((select array_agg(contact_id order by contact_id) = array['71000000-0000-4000-8000-0000000000c1']::uuid[] and max(role) = 'Gerente'
  from public.crm_contact_account where account_id = '71000000-0000-4000-8000-0000000000a1'), 'solo la persona elegida, con su papel');
select pg_temp.assert((select count(*) = 1 from public.crm_contact where id = '71000000-0000-4000-8000-0000000000c2'), 'la persona no elegida no se borra');
select pg_temp.assert((select count(*) = 1 from public.account_link where '71000000-0000-4000-8000-0000000000a1' in (a_id, b_id)
  and '71000000-0000-4000-8000-0000000000a3' in (a_id, b_id)), 'el enlace elegido');
select pg_temp.assert((select count(*) = 0 from public.account_link where '71000000-0000-4000-8000-0000000000a5' in (a_id, b_id)), 'el no elegido, fuera');
select pg_temp.assert((select count(*) = 1 from public.crm_activity where account_id = '71000000-0000-4000-8000-0000000000a1' and note = 'Hablé con el encargado'), 'la interacción pasa');
select pg_temp.assert((select parent_id = '71000000-0000-4000-8000-0000000000a1' from public.account where id = '71000000-0000-4000-8000-0000000000a4'), 'su local pasa al grupo que se queda');
select pg_temp.assert((select place_id = 'place-71' from public.account where id = '71000000-0000-4000-8000-0000000000a1'), 'la ficha de Google elegida');

delete from public.account where id in ('71000000-0000-4000-8000-0000000000a1', '71000000-0000-4000-8000-0000000000a3', '71000000-0000-4000-8000-0000000000a4', '71000000-0000-4000-8000-0000000000a5');
delete from public.crm_contact where id in ('71000000-0000-4000-8000-0000000000c1', '71000000-0000-4000-8000-0000000000c2');
\echo '71_account_merge OK'
