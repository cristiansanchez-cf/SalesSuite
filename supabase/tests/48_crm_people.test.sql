-- CRM fase 2 (docs/CRM_DINAMICO.md): personas y su papel en cada empresa, grupos de un nivel e importaciones.
-- El equipo ve y añade personas; borrar e importar es de admin o gerente; otro espacio no ve nada.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.crm_field (tenant_id, key, label, type, target) values ('00000000-0000-4000-8000-000000000e01', 'icp', 'ICP', 'number', 'contact');
insert into public.account (id, tenant_id, name) values
  ('48000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Grupo 48'),
  ('48000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Local 48'),
  ('48000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000e01', 'Otro 48');
update public.account set parent_id = '48000000-0000-4000-8000-0000000000a1' where id = '48000000-0000-4000-8000-0000000000a2';
-- Un solo nivel: el grupo no entra en otro grupo y un local no es grupo de nadie.
do $$ begin
  update public.account set parent_id = '48000000-0000-4000-8000-0000000000a3' where id = '48000000-0000-4000-8000-0000000000a1';
  raise exception 'ASSERT FAILED: grupo dentro de otro grupo';
exception when check_violation then null; end $$;
do $$ begin
  update public.account set parent_id = '48000000-0000-4000-8000-0000000000a2' where id = '48000000-0000-4000-8000-0000000000a3';
  raise exception 'ASSERT FAILED: un local como grupo';
exception when check_violation then null; end $$;
-- Un campo de persona no vale en una empresa.
do $$ begin
  update public.account set fields = '{"icp": 3}' where id = '48000000-0000-4000-8000-0000000000a3';
  raise exception 'ASSERT FAILED: campo de persona en una empresa';
exception when check_violation then null; end $$;
insert into public.crm_import (id, tenant_id, file_name, target, headers, rows) values
  ('48000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000e01', 'x.csv', 'contact', '{Name}', '[["Ana"]]');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
insert into public.crm_contact (id, tenant_id, name, fields) values ('48000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000e01', 'Bruno 48', '{"icp": 3}');
insert into public.crm_contact_account (tenant_id, contact_id, account_id, role) values
  ('00000000-0000-4000-8000-000000000e01', '48000000-0000-4000-8000-0000000000c1', '48000000-0000-4000-8000-0000000000a2', 'Fundador'),
  ('00000000-0000-4000-8000-000000000e01', '48000000-0000-4000-8000-0000000000c1', '48000000-0000-4000-8000-0000000000a3', 'DJ');
select pg_temp.assert((select created_by from public.crm_contact where name = 'Bruno 48') = '11111111-1111-4111-8111-111111111111', 'queda quién la creó');
select pg_temp.assert((select count(*) from public.crm_contact_account where contact_id = '48000000-0000-4000-8000-0000000000c1') = 2, 'una persona en dos empresas');
do $$ begin
  update public.crm_contact set fields = '{"inventado": 1}' where name = 'Bruno 48';
  raise exception 'ASSERT FAILED: clave que no es un campo de persona';
exception when check_violation then null; end $$;
select pg_temp.assert((select count(*) from public.crm_import) = 0, 'el comercial no ve importaciones');
delete from public.crm_contact where name = 'Bruno 48';
select pg_temp.assert((select count(*) from public.crm_contact where name = 'Bruno 48') = 1, 'el comercial no borra personas (RLS: 0 filas)');

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- comercial de otro espacio
select pg_temp.assert((select count(*) from public.crm_contact) = 0, 'otro espacio no ve personas');
select pg_temp.assert((select count(*) from public.crm_contact_account) = 0, 'ni sus empresas');
do $$ begin
  insert into public.crm_contact (tenant_id, name) values ('00000000-0000-4000-8000-000000000e01', 'Intruso');
  raise exception 'ASSERT FAILED: alta en otro espacio';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
-- Deshacer una importación: borrar por import_id se lleva los vínculos.
update public.crm_contact set import_id = '48000000-0000-4000-8000-0000000000f1' where name = 'Bruno 48';
delete from public.crm_contact where import_id = '48000000-0000-4000-8000-0000000000f1';
select pg_temp.assert((select count(*) from public.crm_contact_account where contact_id = '48000000-0000-4000-8000-0000000000c1') = 0, 'los vínculos se van con la persona');
reset role;
delete from public.account where name like '% 48';
delete from public.crm_import where id = '48000000-0000-4000-8000-0000000000f1';
delete from public.crm_field where tenant_id = '00000000-0000-4000-8000-000000000e01';
