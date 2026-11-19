-- Sale del equipo con propuestas abiertas o empresas a su nombre → aviso a los admins (no a quien lo quitó).
-- Sin nada a su nombre, o colaborador/a: sin aviso.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('88888888-0000-4000-8000-000000000001', 'sevaa88@test'),
  ('88888888-0000-4000-8000-000000000002', 'nada88@test'),
  ('88888888-0000-4000-8000-000000000003', 'otroadmin88@test');
insert into public.membership (user_id, tenant_id, role) values
  ('88888888-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('88888888-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('88888888-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', 'admin');
insert into public.dossier (tenant_id, author_id, title, price_mode) values
  ('00000000-0000-4000-8000-000000000e01', '88888888-0000-4000-8000-000000000001', 'Abierta', 'per_module');
insert into public.dossier (tenant_id, author_id, title, price_mode, outcome) values
  ('00000000-0000-4000-8000-000000000e01', '88888888-0000-4000-8000-000000000001', 'Ganada', 'per_module', 'won');
insert into public.account (tenant_id, name, owner_id) values
  ('00000000-0000-4000-8000-000000000e01', 'Sala 88', '88888888-0000-4000-8000-000000000001');

-- Lo quita el otro admin: le llega a los demás admins, no a él.
set request.jwt.claim.sub = '88888888-0000-4000-8000-000000000003';
delete from public.membership where user_id = '88888888-0000-4000-8000-000000000001' and tenant_id = '00000000-0000-4000-8000-000000000e01';
reset request.jwt.claim.sub;
select pg_temp.assert((select count(*) > 0 from public.notification where kind = 'member_left' and entity_key = '88888888-0000-4000-8000-000000000001'), 'aviso a los admins');
select pg_temp.assert((select count(*) = 0 from public.notification where kind = 'member_left' and user_id = '88888888-0000-4000-8000-000000000003'), 'a quien lo quitó, no');
select pg_temp.assert((select bool_and((params->>'dossiers')::int = 1 and (params->>'accounts')::int = 1 and severity = 'action')
  from public.notification where kind = 'member_left' and entity_key = '88888888-0000-4000-8000-000000000001'), 'cuenta solo las abiertas y sus empresas');

delete from public.membership where user_id = '88888888-0000-4000-8000-000000000002' and tenant_id = '00000000-0000-4000-8000-000000000e01';
select pg_temp.assert((select count(*) = 0 from public.notification where kind = 'member_left' and entity_key = '88888888-0000-4000-8000-000000000002'), 'sin nada a su nombre: sin aviso');
