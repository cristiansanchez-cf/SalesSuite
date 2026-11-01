-- Aislamiento entre espacios en las tablas del CRM, cobros y comisiones (lo que el test de la demo,
-- src/lib/data/tenant-isolation.test.ts, comprueba en memoria). Desde otro espacio no se lee, edita ni borra nada,
-- aunque se conozca el id; tampoco lo que en el propio espacio sí se podría (una persona sin dueño, una cuenta libre).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- Admin de Re-tema (otro espacio) y alguien que está en los dos: comercial en Enjoy y comercial en Re-tema.
insert into auth.users (id, email) values
  ('75757575-0000-4000-8000-0000000000a1', 'admin@retheme75.test'),
  ('75757575-0000-4000-8000-0000000000a2', 'dual@retheme75.test');
insert into public.membership (user_id, tenant_id, role) values
  ('75757575-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a01', 'admin'),
  ('75757575-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('75757575-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000a01', 'rep');

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.account (id, tenant_id, name) values ('75000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Libre 75');
insert into public.crm_contact (id, tenant_id, name, owner_id) values
  ('75000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000e01', 'Sin dueño 75', null),
  ('75000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000e01', 'Suelta 75', null);   -- sin empresa
insert into public.crm_contact_account (tenant_id, contact_id, account_id) values
  ('00000000-0000-4000-8000-000000000e01', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000a1');
insert into public.crm_activity (id, tenant_id, account_id, channel, outcome, note) values
  ('75000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000e01', '75000000-0000-4000-8000-0000000000a1', 'visit', 'note', 'Visita 75');
insert into public.commission_plan (id, tenant_id, name, is_default, rules) values
  ('75000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000e01', 'Plan 75', false, '[]');

-- ---------------------------------------------------------------- admin de otro espacio
set request.jwt.claim.sub = '75757575-0000-4000-8000-0000000000a1';
select pg_temp.assert((select count(*) from public.account where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro espacio no ve cuentas');
select pg_temp.assert((select count(*) from public.crm_contact where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'ni personas');
select pg_temp.assert((select count(*) from public.crm_activity where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'ni historial');
select pg_temp.assert((select count(*) from public.commission_plan where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'ni planes de comisión');
select pg_temp.assert((select count(*) from public.payment_request where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'ni enlaces de pago');
do $$ declare n int; begin
  -- Una persona sin dueño la puede editar cualquiera DE SU ESPACIO; de fuera, nadie (la demo, crm/db-demo.ts, no lo replica).
  update public.crm_contact set name = 'Robada' where id = '75000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio edita una persona sin dueño');
  update public.account set name = 'Robada' where id = '75000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio edita una cuenta libre');
  update public.commission_plan set name = 'Robado' where id = '75000000-0000-4000-8000-0000000000f1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio edita un plan de comisión');
  delete from public.crm_activity where id = '75000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio borra historial');
  delete from public.crm_contact_account where contact_id = '75000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio borra vínculos');
  delete from public.account where id = '75000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio borra cuentas');
end $$;
do $$ begin
  insert into public.crm_activity (tenant_id, account_id, channel, outcome) values
    ('00000000-0000-4000-8000-000000000e01', '75000000-0000-4000-8000-0000000000a1', 'visit', 'note');
  raise exception 'ASSERT FAILED: apunta en el historial de otro espacio';
exception when insufficient_privilege then null; end $$;
-- Un vínculo «en su espacio» con una persona de Enjoy: lo frena la clave (tenant_id, contact_id).
insert into public.account (id, tenant_id, name) values ('75000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000a01', 'Alt 75');
do $$ begin
  insert into public.crm_contact_account (tenant_id, contact_id, account_id) values
    ('00000000-0000-4000-8000-000000000a01', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000b1');
  raise exception 'ASSERT FAILED: vincula una persona de otro espacio';
exception when foreign_key_violation then null; end $$;

-- ---------------------------------------------------------------- quien está en los dos espacios
-- Puede trabajar en cada uno, pero no pasar filas de uno a otro cambiando tenant_id.
set request.jwt.claim.sub = '75757575-0000-4000-8000-0000000000a2';
select pg_temp.assert((select count(*) from public.crm_contact where id = '75000000-0000-4000-8000-0000000000c1') = 1, 'dual: ve la persona de Enjoy (es de Enjoy)');
do $$ declare n int := 0; begin
  -- Con empresa no se mueve (antes lo frenaba la clave del vínculo; ahora, keep_tenant_id en todas las tablas).
  begin
    update public.crm_contact set tenant_id = '00000000-0000-4000-8000-000000000a01' where id = '75000000-0000-4000-8000-0000000000c1';
    get diagnostics n = row_count;
  exception when foreign_key_violation or insufficient_privilege then n := 0; end;
  perform pg_temp.assert(n = 0, 'dual: mueve a otro espacio una persona con empresa');
end $$;
-- Antes «KNOWN BUG 75»: quien está en dos espacios movía una persona sin dueño ni empresa cambiando tenant_id. Desde
-- 20261213000000_tenant_id_fixed.sql ninguna fila cambia de espacio.
do $$ declare n int := 0; begin
  begin
    update public.crm_contact set tenant_id = '00000000-0000-4000-8000-000000000a01' where id = '75000000-0000-4000-8000-0000000000c2';
    get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0; end;
  perform pg_temp.assert(n = 0, 'dual: mueve a otro espacio una persona suelta');
end $$;
reset role;
update public.crm_contact set tenant_id = '00000000-0000-4000-8000-000000000e01' where id = '75000000-0000-4000-8000-0000000000c2';
set role authenticated;

reset role;
select pg_temp.assert((select name from public.crm_contact where id = '75000000-0000-4000-8000-0000000000c1') = 'Sin dueño 75', 'la persona sigue igual');
select pg_temp.assert((select name from public.account where id = '75000000-0000-4000-8000-0000000000a1') = 'Libre 75', 'la cuenta sigue igual');
select pg_temp.assert((select name from public.commission_plan where id = '75000000-0000-4000-8000-0000000000f1') = 'Plan 75', 'el plan sigue igual');
select pg_temp.assert((select count(*) from public.crm_activity where id = '75000000-0000-4000-8000-0000000000e1') = 1, 'el historial sigue');
select pg_temp.assert((select count(*) from public.crm_contact_account where contact_id = '75000000-0000-4000-8000-0000000000c1') = 1, 'el vínculo sigue');

delete from public.crm_activity where id = '75000000-0000-4000-8000-0000000000e1';
delete from public.crm_contact where id in ('75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000c2');
delete from public.account where id in ('75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1');
delete from public.commission_plan where id = '75000000-0000-4000-8000-0000000000f1';
-- Sus membresías se van en cascada con el usuario (keep_one_admin no salta en cascada).
delete from auth.users where id in ('75757575-0000-4000-8000-0000000000a1', '75757575-0000-4000-8000-0000000000a2');
\echo '75_tenant_isolation OK'
