-- Organigrama: el gerente de una delegación ve y gestiona solo a su equipo; el global, todo; el superadmin, todos los espacios.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'gerente.norte@enjoy.test'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'rep.norte@enjoy.test'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'super@cofundo.test'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'gerente.global@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('a1a1a1a1-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000e01', 'lead');
insert into public.platform_admin (user_id) values ('a1a1a1a1-0000-4000-8000-000000000003');

-- El admin crea la delegación con su gerente: pasa a gerente y a la delegación.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.delegation (id, tenant_id, name, manager_id) values
  ('d0d0d0d0-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Norte', 'a1a1a1a1-0000-4000-8000-000000000001');
select public.set_member_delegation('00000000-0000-4000-8000-000000000e01', 'a1a1a1a1-0000-4000-8000-000000000002', 'd0d0d0d0-0000-4000-8000-000000000001');
reset role;
select pg_temp.assert((select role = 'lead' and delegation_id = 'd0d0d0d0-0000-4000-8000-000000000001' from public.membership
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001' and tenant_id = '00000000-0000-4000-8000-000000000e01'), 'el gerente pasa a lead de su delegación');

-- Dos propuestas: una de su equipo y otra de fuera.
insert into public.dossier (id, tenant_id, author_id, title) values
  ('d0d0d0d0-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'a1a1a1a1-0000-4000-8000-000000000002', 'Norte'),
  ('d0d0d0d0-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Fuera');
insert into public.commission_entry (tenant_id, user_id, dedupe_key, kind, base_cents, amount_cents, currency, period, status, reason) values
  ('00000000-0000-4000-8000-000000000e01', 'a1a1a1a1-0000-4000-8000-000000000002', 'org-test-1', 'adjustment', 0, 1000, 'EUR', '2026-10', 'pending', 'test'),
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'org-test-2', 'adjustment', 0, 2000, 'EUR', '2026-10', 'pending', 'test');

set role authenticated;
-- Gerente de delegación: lo suyo sí, lo de fuera no.
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-000000000001';
select pg_temp.assert(exists (select 1 from public.dossier where id = 'd0d0d0d0-0000-4000-8000-0000000000a1'), 'gerente ve las propuestas de su equipo');
select pg_temp.assert(not exists (select 1 from public.dossier where id = 'd0d0d0d0-0000-4000-8000-0000000000a2'), 'gerente NO ve las de fuera de su delegación');
select pg_temp.assert((select count(*) from public.commission_entry where dedupe_key like 'org-test-%') = 1, 'gerente ve solo las comisiones de su equipo');
select pg_temp.assert(public.can_edit_dossier('d0d0d0d0-0000-4000-8000-0000000000a1') and not public.can_edit_dossier('d0d0d0d0-0000-4000-8000-0000000000a2'), 'edita solo las de su equipo');
do $$ begin
  perform public.set_member_delegation('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'd0d0d0d0-0000-4000-8000-000000000001');
  raise exception 'ASSERT FAILED: un gerente de delegación mueve gente';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert(public.platform_overview() is null, 'un gerente no ve la plataforma');

-- Gerente global (lead sin delegación): todo.
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-000000000004';
select pg_temp.assert((select count(*) from public.dossier where id in ('d0d0d0d0-0000-4000-8000-0000000000a1', 'd0d0d0d0-0000-4000-8000-0000000000a2')) = 2, 'gerente global ve todas');
select pg_temp.assert((select count(*) from public.commission_entry where dedupe_key like 'org-test-%') = 2, 'gerente global ve todas las comisiones');

-- Un comercial: sigue viendo las propuestas del espacio, pero solo sus comisiones.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.commission_entry where dedupe_key like 'org-test-%') = 1, 'el comercial solo ve sus comisiones');

-- Superadmin: sin ser miembro, entra en todos los espacios como admin y ve la plataforma.
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-000000000003';
select pg_temp.assert(public.is_admin('00000000-0000-4000-8000-000000000e01') and public.is_admin('00000000-0000-4000-8000-000000000a01'), 'superadmin es admin de todos');
select pg_temp.assert(public.my_role('00000000-0000-4000-8000-000000000a01') = 'admin', 'superadmin: rol efectivo admin');
select pg_temp.assert((select count(*) from public.dossier where id in ('d0d0d0d0-0000-4000-8000-0000000000a1', 'd0d0d0d0-0000-4000-8000-0000000000a2')) = 2, 'superadmin ve todas las propuestas');
select pg_temp.assert(jsonb_array_length(public.platform_overview()) >= 2, 'superadmin ve todos los espacios');
select pg_temp.assert(exists (select 1 from public.users where id = '33333333-3333-4333-8333-333333333333'), 'superadmin ve a la gente de otros espacios');
-- Nadie con sesión lee ni se apunta a platform_admin.
do $$ begin
  insert into public.platform_admin (user_id) values ('11111111-1111-4111-8111-111111111111');
  raise exception 'ASSERT FAILED: alguien se hace superadmin';
exception when insufficient_privilege then null; end $$;
reset role;

delete from public.commission_entry where dedupe_key like 'org-test-%';
delete from public.dossier where id in ('d0d0d0d0-0000-4000-8000-0000000000a1', 'd0d0d0d0-0000-4000-8000-0000000000a2');
delete from public.delegation where id = 'd0d0d0d0-0000-4000-8000-000000000001';
delete from public.platform_admin;
delete from public.membership where user_id in ('a1a1a1a1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000004');
