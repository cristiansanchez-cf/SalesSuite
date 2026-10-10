-- Contacto del comercial en la propuesta (docs/PERSONALIZE.md §Contacto del comercial): cada uno pone el suyo y la
-- propuesta pública lo lee con get_public_contact (misma puerta que get_public_dossier).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

do $$ begin
  update public.users set contact_channel = 'fax' where id = (select author_id from public.dossier d join public.share_link l on l.dossier_id = d.id where l.token = 'demo-sala-x-7Qm2');
  raise exception 'ASSERT FAILED: canal desconocido';
exception when check_violation then null; end $$;

-- Sin contacto propio: nada (la propuesta usa el de la marca).
update public.users set contact_channel = null, contact_value = null where id = (select author_id from public.dossier d join public.share_link l on l.dossier_id = d.id where l.token = 'demo-sala-x-7Qm2');
set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is null, 'sin contacto propio → null');
reset role;

-- Cada uno edita el suyo (users_update_self). Canal sin valor: pendiente, la propuesta sigue con el de la marca.
select set_config('test.author', (select author_id::text from public.dossier d join public.share_link l on l.dossier_id = d.id where l.token = 'demo-sala-x-7Qm2'), false);
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.author'), false);
update public.users set contact_channel = 'kakao', contact_value = null where id = current_setting('test.author')::uuid;
reset role;
set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is null, 'canal sin valor → null');
reset role;
set role authenticated;
update public.users set contact_value = 'diver_kim' where id = current_setting('test.author')::uuid;
reset role;

set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'channel' = 'kakao', 'anon: canal del autor');
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'value' = 'diver_kim', 'anon: valor del autor');
select pg_temp.assert(not (public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ? 'email'), 'anon: nada más del perfil');
select pg_temp.assert(public.get_public_contact('demo-draft-Kp9wQ1', '00000000-0000-4000-8000-000000000e01') is null, 'borrador → null');
select pg_temp.assert(public.get_public_contact('demo-revoked-Zt4c', '00000000-0000-4000-8000-000000000e01') is null, 'revocado → null');
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e99') is null, 'otro espacio → null');
reset role;

-- Otra persona (aunque sea admin del espacio) no puede cambiar el contacto de quien hizo la propuesta.
select pg_temp.assert(current_setting('test.author') <> '22222222-2222-4222-8222-222222222222', 'el autor no es el admin');
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
update public.users set contact_value = 'hack' where id = current_setting('test.author')::uuid;
reset role;
select pg_temp.assert((select contact_value from public.users where id = current_setting('test.author')::uuid) = 'diver_kim', 'solo uno mismo cambia su contacto');

update public.users set contact_channel = null, contact_value = null where id = current_setting('test.author')::uuid;
