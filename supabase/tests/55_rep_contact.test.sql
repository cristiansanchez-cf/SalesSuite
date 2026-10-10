-- Contacto del comercial en la propuesta (docs/PERSONALIZE.md §Contacto del comercial): va POR ESPACIO (membresía).
-- Cada uno pone el suyo (set_my_contact), un admin el de su equipo (set_member_contact), y la propuesta pública lo lee
-- con get_public_contact (misma puerta que get_public_dossier). El admin de otro espacio no puede tocar el de este.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

select set_config('test.author', (select author_id::text from public.dossier d join public.share_link l on l.dossier_id = d.id where l.token = 'demo-sala-x-7Qm2'), false);
select set_config('test.tenant', (select d.tenant_id::text from public.dossier d join public.share_link l on l.dossier_id = d.id where l.token = 'demo-sala-x-7Qm2'), false);

do $$ begin
  update public.membership set contact_channel = 'fax' where user_id = current_setting('test.author')::uuid;
  raise exception 'ASSERT FAILED: canal desconocido';
exception when check_violation then null; end $$;

-- Sin contacto propio: nada (la propuesta usa el de la marca).
update public.membership set contact_channel = null, contact_value = null where user_id = current_setting('test.author')::uuid;
set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is null, 'sin contacto propio → null');
reset role;

-- Cada uno pone el suyo en su espacio. Canal sin valor: pendiente, la propuesta sigue con el de la marca.
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.author'), false);
select public.set_my_contact(current_setting('test.tenant')::uuid, 'kakao', '');
reset role;
set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is null, 'canal sin valor → null');
reset role;
set role authenticated;
select public.set_my_contact(current_setting('test.tenant')::uuid, 'kakao', ' diver_kim ');
do $$ begin
  perform public.set_my_contact('00000000-0000-4000-8000-000000000e99', 'phone', '600');
  raise exception 'ASSERT FAILED: pone su contacto en un espacio que no es suyo';
exception when insufficient_privilege then null; end $$;
reset role;

set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'channel' = 'kakao', 'anon: canal del autor');
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'value' = 'diver_kim', 'anon: valor del autor');
select pg_temp.assert(not (public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ? 'email'), 'anon: nada más del perfil');
select pg_temp.assert(public.get_public_contact('demo-draft-Kp9wQ1', '00000000-0000-4000-8000-000000000e01') is null, 'borrador → null');
select pg_temp.assert(public.get_public_contact('demo-revoked-Zt4c', '00000000-0000-4000-8000-000000000e01') is null, 'revocado → null');
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e99') is null, 'otro espacio → null');
reset role;

-- Un admin del espacio pone el contacto de alguien de su equipo; un comercial no puede.
update public.membership set contact_channel = null, contact_value = null where user_id = current_setting('test.author')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select public.set_member_contact(current_setting('test.tenant')::uuid, current_setting('test.author')::uuid, 'kakao', ' open_kim ');
reset role;
select pg_temp.assert((select contact_channel = 'kakao' and contact_value = 'open_kim' from public.membership where user_id = current_setting('test.author')::uuid and tenant_id = current_setting('test.tenant')::uuid), 'admin: pone el contacto de su comercial');
set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$ begin
  perform public.set_member_contact(current_setting('test.tenant')::uuid, current_setting('test.author')::uuid, 'phone', '600000000');
  raise exception 'ASSERT FAILED: un comercial pone el contacto de otro';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$ begin
  perform public.set_member_contact(current_setting('test.tenant')::uuid, '33333333-3333-4333-8333-333333333333', 'phone', '600000000');
  raise exception 'ASSERT FAILED: admin pone el contacto de alguien de otro espacio';
exception when insufficient_privilege then null; end $$;
reset role;

-- El ataque de la revisión: el admin de OTRO espacio mete al comercial en su espacio y le cambia el contacto.
-- Solo cambia el de su espacio; la propuesta de este espacio sigue con el de aquí.
select set_config('test.other_role', coalesce((select role::text from public.membership where tenant_id = '00000000-0000-4000-8000-000000000a01' and user_id = '33333333-3333-4333-8333-333333333333'), ''), false);
insert into public.membership (tenant_id, user_id, role) values ('00000000-0000-4000-8000-000000000a01', '33333333-3333-4333-8333-333333333333', 'admin')
  on conflict (tenant_id, user_id) do update set role = 'admin';
insert into public.membership (tenant_id, user_id, role) values ('00000000-0000-4000-8000-000000000a01', current_setting('test.author')::uuid, 'rep') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
select public.set_member_contact('00000000-0000-4000-8000-000000000a01', current_setting('test.author')::uuid, 'whatsapp', '+34 666 000 000');
reset role;
set role anon;
select pg_temp.assert(public.get_public_contact('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'value' = 'open_kim', 'el admin de otro espacio no cambia el contacto de aquí');
reset role;

delete from public.membership where tenant_id = '00000000-0000-4000-8000-000000000a01' and user_id = current_setting('test.author')::uuid;
do $$ begin  -- su rol de antes (si era el único admin de su espacio, se queda de admin)
  update public.membership set role = current_setting('test.other_role')::public.member_role where tenant_id = '00000000-0000-4000-8000-000000000a01' and user_id = '33333333-3333-4333-8333-333333333333' and current_setting('test.other_role') <> '';
exception when others then null; end $$;
do $$ begin
  delete from public.membership where tenant_id = '00000000-0000-4000-8000-000000000a01' and user_id = '33333333-3333-4333-8333-333333333333' and current_setting('test.other_role') = '';
exception when others then null; end $$;
update public.membership set contact_channel = null, contact_value = null where user_id = current_setting('test.author')::uuid;
