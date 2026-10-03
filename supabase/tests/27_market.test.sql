\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- rep de Enjoy: lee el mapa, no lo edita
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.segment) = 4, 'rep ve los 4 sectores');
select pg_temp.assert((select count(*) from public.persona) = 15, 'rep ve los 15 actores');
select pg_temp.assert((select count(*) from public.persona_module) = 16, 'rep ve los ángulos por módulo');
update public.persona set name = 'hack' where key = 'novios';
select pg_temp.assert((select name from public.persona where key = 'novios') = 'Novios', 'rep no edita actores');
do $$ begin
  insert into public.segment (tenant_id, key, name) values ('00000000-0000-4000-8000-000000000e01', 'hack', 'Hack');
  raise exception 'ASSERT FAILED: rep creó sector';
exception when insufficient_privilege then null; end $$;
-- contactos: lee los de Sala X, no los edita (no es su dossier)
select pg_temp.assert((select count(*) from public.dossier_contact) = 3, 'rep ve el mapa de poder de la cuenta');
update public.dossier_contact set stance = 'aliado' where name = 'DJ Toni';
select pg_temp.assert((select stance::text from public.dossier_contact where name = 'DJ Toni') = 'bloqueador', 'rep no edita contactos de dossier ajeno');
-- en su propio dossier sí
insert into public.dossier (id, tenant_id, author_id, title, segment_id)
values ('66666666-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Mío',
        (select id from public.segment where key = 'ocio-nocturno'));
insert into public.dossier_contact (dossier_id, persona_id, name, stance)
values ('66666666-0000-4000-8000-000000000001', (select id from public.persona where key = 'dj-residente'), 'DJ Max', 'aliado');
select pg_temp.assert((select tenant_id from public.dossier_contact where name = 'DJ Max') = '00000000-0000-4000-8000-000000000e01', 'tenant del contacto derivado del dossier');
reset role;

-- contacto apuntando a un actor de otro tenant → FK compuesta lo impide
insert into public.segment (id, tenant_id, key, name) values ('77777777-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000a01', 'otro', 'Otro');
insert into public.persona (id, tenant_id, segment_id, key, name, role) values ('77777777-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000a01', '77777777-0000-4000-8000-000000000001', 'otro-actor', 'Otro', 'decisor');
do $$ begin
  insert into public.dossier_contact (dossier_id, persona_id, name) values ('66666666-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000002', 'x');
  raise exception 'ASSERT FAILED: actor de otro tenant en un contacto';
exception when foreign_key_violation then null; end $$;

-- otro tenant no ve nada de Enjoy
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select pg_temp.assert((select count(*) from public.persona where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro tenant no ve actores de Enjoy');
select pg_temp.assert((select count(*) from public.dossier_contact where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro tenant no ve contactos de Enjoy');
reset role;

-- el RPC público no expone contactos ni próximo paso
update public.share_link set is_active = true where token = 'demo-sala-x-7Qm2';  -- lo revocó un test anterior
update public.dossier set status = 'published' where id = '00000000-0000-4000-8000-000000d05501';
set role anon;
select pg_temp.assert(public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is not null, 'enlace activo para la comprobación');
select pg_temp.assert(not (public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01')::text ~ '(DJ Toni|next_step|Laura \(novia\))'), 'enlace público sin datos internos de la cuenta');
reset role;

-- admin edita el mapa
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.persona set kpis = 'Caja por noche' where key = 'propietario-local';
select pg_temp.assert((select kpis from public.persona where key = 'propietario-local') = 'Caja por noche', 'admin edita actores');
reset role;
