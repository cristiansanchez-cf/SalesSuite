-- Jefe/a de ventas y red de colaboradores.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('66666666-6666-4666-8666-666666666666', 'jefa@enjoy.test'),
  ('77777777-7777-4777-8777-777777777777', 'dj2@enjoy.test'),
  ('88888888-8888-4888-8888-888888888888', 'nuevo@enjoy.test'),
  ('99999999-9999-4999-8999-999999999999', 'dj3@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values ('66666666-6666-4666-8666-666666666666', '00000000-0000-4000-8000-000000000e01', 'lead');
insert into public.membership (user_id, tenant_id, role) values ('77777777-7777-4777-8777-777777777777', '00000000-0000-4000-8000-000000000e01', 'partner');
insert into public.partner_profile (tenant_id, user_id, module_ids) values ('00000000-0000-4000-8000-000000000e01', '77777777-7777-4777-8777-777777777777', '{00000000-0000-4000-8000-00000000e102}');
insert into public.partner_account (id, tenant_id, user_id, name, price_policy, price_adjust_pct)
values ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '77777777-7777-4777-8777-777777777777', 'Sala', 'adjusted', -10);

select count(*) as enjoy_dossiers from public.dossier where tenant_id = '00000000-0000-4000-8000-000000000e01' \gset
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';  -- lead
select pg_temp.assert((select count(*) from public.dossier) = :enjoy_dossiers, 'lead ve los dossiers del equipo');
update public.dossier set title = 'Editado por la jefa' where id = '00000000-0000-4000-8000-000000d05501';
select pg_temp.assert((select title from public.dossier where id = '00000000-0000-4000-8000-000000d05501') = 'Editado por la jefa', 'lead edita dossiers ajenos');
insert into public.membership (user_id, tenant_id, role) values ('88888888-8888-4888-8888-888888888888', '00000000-0000-4000-8000-000000000e01', 'rep');
select pg_temp.assert((select invited_by from public.membership where user_id = '88888888-8888-4888-8888-888888888888') = '66666666-6666-4666-8666-666666666666', 'invited_by = quien invita');
do $$ begin
  insert into public.membership (user_id, tenant_id, role) values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-000000000e01', 'admin');
  raise exception 'ASSERT FAILED: lead crea un admin';
exception when insufficient_privilege then null; end $$;
update public.partner_account set price_policy = 'list', price_adjust_pct = 0, name = 'Sala renombrada' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.assert((select price_policy::text || price_adjust_pct::text || name from public.partner_account where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'adjusted-10.00Sala renombrada', 'lead renombra pero no cambia el precio');
update public.tenant set name = 'hack';
select pg_temp.assert((select name from public.tenant where slug = 'enjoy') <> 'hack', 'lead no edita la marca');
insert into public.play (tenant_id, kind, title) values ('00000000-0000-4000-8000-000000000e01', 'tip', 'Del lead');
reset role;

-- Colaborador sin permiso no invita; con permiso, sí (hereda módulos) y queda trazado.
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$ begin
  perform public.partner_invite_partner('00000000-0000-4000-8000-000000000e01', '99999999-9999-4999-8999-999999999999');
  raise exception 'ASSERT FAILED: invitó sin permiso';
exception when insufficient_privilege then null; end $$;
reset role;
update public.partner_profile set can_invite = true where user_id = '77777777-7777-4777-8777-777777777777';
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
select public.partner_invite_partner('00000000-0000-4000-8000-000000000e01', '99999999-9999-4999-8999-999999999999');
select pg_temp.assert((select count(*) from public.membership) = 2, 'el colaborador ve su membership y la de su invitado');
select pg_temp.assert((select count(*) from public.users where email = 'dj3@enjoy.test') = 1, 've a su invitado');
-- Aporte al playbook: solo pendiente.
insert into public.play_contribution (tenant_id, type, module_id, kind, title, body, status, author_id)
values ('00000000-0000-4000-8000-000000000e01', 'tip', '00000000-0000-4000-8000-00000000e102', 'tip', 'Truco DJ2', 'x', 'pending', '77777777-7777-4777-8777-777777777777');
do $$ begin
  insert into public.play_contribution (tenant_id, type, kind, title, body, status, author_id)
  values ('00000000-0000-4000-8000-000000000e01', 'tip', 'tip', 'Directo', 'x', 'shared', '77777777-7777-4777-8777-777777777777');
  raise exception 'ASSERT FAILED: colaborador publica sin aprobación';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.assert((select invited_by from public.membership where user_id = '99999999-9999-4999-8999-999999999999') = '77777777-7777-4777-8777-777777777777', 'invited_by del colaborador');
select pg_temp.assert((select module_ids from public.partner_profile where user_id = '99999999-9999-4999-8999-999999999999') = '{00000000-0000-4000-8000-00000000e102}', 'hereda módulos');

delete from public.play where title = 'Del lead';
delete from public.play_contribution where title = 'Truco DJ2';
update public.dossier set title = 'Sala X · Bodas 2027' where id = '00000000-0000-4000-8000-000000d05501';
delete from auth.users where email in ('jefa@enjoy.test', 'dj2@enjoy.test', 'nuevo@enjoy.test', 'dj3@enjoy.test');
