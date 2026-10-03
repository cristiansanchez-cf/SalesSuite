-- Aserciones de seguridad. Cualquier fallo → exception → psql sale con error (ON_ERROR_STOP).
\set ON_ERROR_STOP on

-- Usuarios: rep y admin de Enjoy, rep de otro tenant.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'rep@enjoy.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin@enjoy.test'),
  ('33333333-3333-4333-8333-333333333333', 'rep@otro.test');
insert into public.membership (user_id, tenant_id, role) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000e01', 'admin'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000a01', 'rep');

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- ---------------------------------------------------------------- anon
set role anon;
select pg_temp.assert((select public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01')) is not null, 'anon: dossier publicado visible por token');
select pg_temp.assert(jsonb_array_length(public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01')->'items') = 4, 'anon: solo 4 items visibles (1 oculto)');
select pg_temp.assert((public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01')->'items'->0->>'block_type') = 'hero-pitch', 'anon: orden por position');
select pg_temp.assert(public.get_public_dossier('demo-draft-Kp9wQ1', '00000000-0000-4000-8000-000000000e01') is null, 'anon: borrador → null');
select pg_temp.assert(public.get_public_dossier('demo-revoked-Zt4c', '00000000-0000-4000-8000-000000000e01') is null, 'anon: revocado → null');
select pg_temp.assert(public.get_public_dossier('demo-expired-Bn3r', '00000000-0000-4000-8000-000000000e01') is null, 'anon: expirado → null');
select pg_temp.assert(public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000a01') is null, 'anon: token de otro tenant → null');
select pg_temp.assert((select count(*) from public.resolve_tenant('pitch.enjoytheclub.es')) = 1, 'anon: resolve_tenant por host');
select pg_temp.assert((select slug from public.resolve_tenant('PITCH.EnjoyTheClub.es')) = 'enjoy', 'anon: host case-insensitive');
select pg_temp.assert((select count(*) from public.resolve_tenant('nope.example.com')) = 0, 'anon: host desconocido');
do $$ begin
  perform 1 from public.dossier;
  raise exception 'ASSERT FAILED: anon no debe poder leer public.dossier';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------- rep de Enjoy
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.dossier) = 3, 'rep Enjoy: ve los 3 dossiers de su tenant');
select pg_temp.assert((select count(*) from public.dossier where tenant_id = '00000000-0000-4000-8000-000000000a01') = 0, 'rep Enjoy: no ve otro tenant');
select pg_temp.assert((select count(*) from public.module_version where tenant_id = '00000000-0000-4000-8000-000000000a01') = 0, 'rep Enjoy: no ve catálogo ajeno');

-- Crea su dossier + item + enlace.
insert into public.dossier (id, tenant_id, author_id, title, price_mode)
values ('44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Rep test', 'per_module');
insert into public.dossier_item (dossier_id, module_version_id, position)
values ('44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-0000000e1011', 1024);
insert into public.share_link (dossier_id) values ('44444444-4444-4444-8444-444444444444');
select pg_temp.assert((select length(token) from public.share_link where dossier_id = '44444444-4444-4444-8444-444444444444') >= 32, 'token generado inadivinable (>=32 chars)');
select pg_temp.assert((select tenant_id from public.dossier_item where dossier_id = '44444444-4444-4444-8444-444444444444') = '00000000-0000-4000-8000-000000000e01', 'tenant_id derivado del padre');

-- No puede usar una module_version de otro tenant (FK compuesta).
do $$ begin
  insert into public.dossier_item (dossier_id, module_version_id, position)
  values ('44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-0000000a1011', 2048);
  raise exception 'ASSERT FAILED: item con versión de otro tenant';
exception when foreign_key_violation then null; end $$;

-- No puede crear dossiers en otro tenant ni a nombre de otro.
do $$ begin
  insert into public.dossier (tenant_id, author_id, title) values ('00000000-0000-4000-8000-000000000a01', '11111111-1111-4111-8111-111111111111', 'x');
  raise exception 'ASSERT FAILED: rep insertó en tenant ajeno';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.dossier (tenant_id, author_id, title) values ('00000000-0000-4000-8000-000000000e01', '22222222-2222-4222-8222-222222222222', 'x');
  raise exception 'ASSERT FAILED: rep suplantó autor';
exception when insufficient_privilege then null; end $$;

-- No edita dossiers que no son suyos (seed: author null) → 0 filas afectadas.
update public.dossier set title = 'hack' where id = '00000000-0000-4000-8000-000000d05501';
select pg_temp.assert((select title from public.dossier where id = '00000000-0000-4000-8000-000000d05501') = 'Sala X · Bodas 2027', 'rep no edita dossier ajeno');
-- Ni sus items.
update public.dossier_item set visible = false where id = '00000000-0000-4000-8000-00000017e002';
select pg_temp.assert((select visible from public.dossier_item where id = '00000000-0000-4000-8000-00000017e002'), 'rep no edita items ajenos');
-- Ni el catálogo.
update public.module set name = 'hack' where id = '00000000-0000-4000-8000-00000000e101';
select pg_temp.assert((select name from public.module where id = '00000000-0000-4000-8000-00000000e101') = 'Portada para bodas', 'rep no edita catálogo');
-- Ni el tema del tenant.
update public.tenant set name = 'hack';
select pg_temp.assert((select name from public.tenant where slug = 'enjoy') = 'Enjoy the Club', 'rep no edita tenant');
-- Ni se auto-promociona.
update public.membership set role = 'admin' where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select role::text from public.membership where user_id = '11111111-1111-4111-8111-111111111111') = 'rep', 'rep no se auto-promociona');
reset role;

-- ---------------------------------------------------------------- rep de otro tenant
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select pg_temp.assert((select count(*) from public.dossier where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro tenant: no ve dossiers de Enjoy');
select pg_temp.assert((select count(*) from public.share_link where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro tenant: no ve tokens de Enjoy');
reset role;

-- ---------------------------------------------------------------- admin de Enjoy
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.dossier set title = 'Sala X (editado por admin)' where id = '00000000-0000-4000-8000-000000d05501';
select pg_temp.assert((select title from public.dossier where id = '00000000-0000-4000-8000-000000d05501') = 'Sala X (editado por admin)', 'admin edita cualquier dossier del tenant');
update public.share_link set is_active = false where token = 'demo-sala-x-7Qm2';
reset role;
set role anon;
select pg_temp.assert(public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is null, 'enlace revocado por admin → null');
reset role;

-- ---------------------------------------------------------------- inmutabilidad de versiones
do $$ begin
  update public.module_version set default_props = '{}' where id = '00000000-0000-4000-8000-0000000e1011';
  raise exception 'ASSERT FAILED: versión publicada modificada';
exception when check_violation then null; end $$;
update public.module_version set status = 'archived' where id = '00000000-0000-4000-8000-0000000e1011';  -- permitido

