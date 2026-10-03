-- Zonas y cuentas: reserva de cuentas, conflicto al vender una cuenta ajena y elegibilidad para comisión.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('abababab-0000-4000-8000-000000000002', 'rep2@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values ('abababab-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep');
delete from public.notification;

-- ---- el admin define el territorio
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.zone (id, tenant_id, parent_id, name, kind) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', null, 'España', 'country'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', '20000000-0000-4000-8000-000000000001', 'Comunidad Valenciana', 'region'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', '20000000-0000-4000-8000-000000000002', 'Valencia', 'city'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000e01', '20000000-0000-4000-8000-000000000002', 'Castellón', 'city'),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000e01', '20000000-0000-4000-8000-000000000001', 'Madrid', 'city');
insert into public.membership_zone (tenant_id, user_id, zone_id) values
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000e01', 'abababab-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005');
insert into public.account (id, tenant_id, name, zone_id, external_ref) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Club Sol', '20000000-0000-4000-8000-000000000003', 'gmaps:sol'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'Sala Gran Vía', '20000000-0000-4000-8000-000000000005', null);
select pg_temp.assert((select owner_id is null and status = 'open' from public.account where name = 'Club Sol'), 'importada por el admin: libre');
reset role;
select pg_temp.assert(public.zone_covers('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'), 'la región cubre la ciudad');
select pg_temp.assert(not public.zone_covers('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003'), 'Madrid no cubre Valencia');

-- ---- un comercial no toca el territorio
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  insert into public.zone (tenant_id, name) values ('00000000-0000-4000-8000-000000000e01', 'Mi zona');
  raise exception 'ASSERT FAILED: comercial crea zonas';
exception when insufficient_privilege then null; end $$;
-- ---- trabaja Club Sol: queda reservada para él
select pg_temp.assert(public.account_touch('30000000-0000-4000-8000-000000000001', 'contact', 'Llamada al dueño') = 'eligible', 'contacto en cuenta libre');
select pg_temp.assert((select owner_id = '11111111-1111-4111-8111-111111111111' and claimed_until > now() + interval '29 days' from public.account where name = 'Club Sol'), 'reservada 30 días');
update public.account set notes = 'Tiene DJ residente' where name = 'Club Sol';
select pg_temp.assert((select notes from public.account where name = 'Club Sol') = 'Tiene DJ residente', 'quien la trabaja edita sus datos');
do $$ begin
  update public.account set claimed_until = now() + interval '5 years' where name = 'Club Sol';
  raise exception 'ASSERT FAILED: alargó su reserva a mano';
exception when insufficient_privilege then null; end $$;
-- Da de alta una cuenta nueva: suya.
insert into public.account (tenant_id, name, zone_id, owner_id) values ('00000000-0000-4000-8000-000000000e01', 'Bar Nuevo', '20000000-0000-4000-8000-000000000004', 'abababab-0000-4000-8000-000000000002');
select pg_temp.assert((select owner_id = '11111111-1111-4111-8111-111111111111' from public.account where name = 'Bar Nuevo'), 'el alta la reserva para quien la crea (no para otro)');
reset role;

-- ---- otro comercial no puede «bombardear» Club Sol
set role authenticated;
set request.jwt.claim.sub = 'abababab-0000-4000-8000-000000000002';
select pg_temp.assert(public.account_touch('30000000-0000-4000-8000-000000000001', 'contact') = 'claimed_by_other', 'reservada para otro');
select pg_temp.assert((select owner_id = '11111111-1111-4111-8111-111111111111' from public.account where name = 'Club Sol'), 'la reserva no cambia');
update public.account set owner_id = 'abababab-0000-4000-8000-000000000002' where name = 'Club Sol';
reset role;
select pg_temp.assert((select owner_id = '11111111-1111-4111-8111-111111111111' from public.account where name = 'Club Sol'), 'no puede quitársela (RLS)');

-- ---- …y si la vende igualmente, no genera comisión y el admin se entera
set role authenticated;
set request.jwt.claim.sub = 'abababab-0000-4000-8000-000000000002';
insert into public.dossier (id, tenant_id, author_id, title, account_id, account_eligibility)
values ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'abababab-0000-4000-8000-000000000002', 'Sol por la puerta de atrás', '30000000-0000-4000-8000-000000000001', 'eligible');
select pg_temp.assert((select account_eligibility is null from public.dossier where id = '40000000-0000-4000-8000-000000000001'), 'la elegibilidad no la pone el cliente');
update public.dossier set outcome = 'won' where id = '40000000-0000-4000-8000-000000000001';
select pg_temp.assert((select account_eligibility = 'claimed_by_other' from public.dossier where id = '40000000-0000-4000-8000-000000000001'), 'venta de cuenta ajena: sin comisión');
update public.dossier set account_eligibility = 'eligible' where id = '40000000-0000-4000-8000-000000000001';
select pg_temp.assert((select account_eligibility = 'claimed_by_other' from public.dossier where id = '40000000-0000-4000-8000-000000000001'), 'no se la cambia a mano');
do $$ begin
  update public.dossier set account_decision = 'approved' where id = '40000000-0000-4000-8000-000000000001';
  raise exception 'ASSERT FAILED: el comercial aprobó su propia comisión';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.assert((select status = 'open' and owner_id = '11111111-1111-4111-8111-111111111111' from public.account where name = 'Club Sol'), 'la cuenta sigue de quien la trabajaba');
select pg_temp.assert((select count(*) from public.notification where kind = 'account_conflict' and user_id = '22222222-2222-4222-8222-222222222222'
  and params->>'reason' = 'claimed_by_other' and params->>'holder' = 'rep@enjoy.test') = 1, 'el admin recibe el conflicto con quién la tenía');

-- ---- el admin decide
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.dossier set account_decision = 'rejected' where id = '40000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.assert((select account_decided_by = '22222222-2222-4222-8222-222222222222' from public.dossier where id = '40000000-0000-4000-8000-000000000001'), 'decisión registrada');
select pg_temp.assert((select resolved_at is not null from public.notification where kind = 'account_conflict'), 'conflicto resuelto');

-- ---- quien la trabajaba la gana: cliente suyo
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.dossier (id, tenant_id, author_id, title, account_id)
values ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Sol', '30000000-0000-4000-8000-000000000001');
update public.dossier set outcome = 'won' where id = '40000000-0000-4000-8000-000000000002';
select pg_temp.assert((select account_eligibility = 'eligible' from public.dossier where id = '40000000-0000-4000-8000-000000000002'), 'venta propia: elegible');
select pg_temp.assert((select status = 'customer' and won_by = '11111111-1111-4111-8111-111111111111' from public.account where name = 'Club Sol'), 'la cuenta pasa a cliente suyo');
update public.dossier set outcome = 'open' where id = '40000000-0000-4000-8000-000000000002';
select pg_temp.assert((select status = 'open' and won_by is null and owner_id = '11111111-1111-4111-8111-111111111111' from public.account where name = 'Club Sol'), 'deshacer la venta la devuelve a trabajo');
select pg_temp.assert((select count(*) from public.account_touch where account_id = '30000000-0000-4000-8000-000000000001') >= 5, 'historial de contactos');
reset role;

-- ---- bloqueo («no autorizamos vender a este local») y zonas estrictas
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.account set status = 'blocked', blocked_reason = 'El dueño no quiere más comerciales' where name = 'Club Sol';
insert into public.account_rules (tenant_id, strict_zones) values ('00000000-0000-4000-8000-000000000e01', true);
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(public.account_touch('30000000-0000-4000-8000-000000000001', 'contact') = 'blocked', 'bloqueada para todos');
select pg_temp.assert(public.account_touch('30000000-0000-4000-8000-000000000002', 'contact') = 'out_of_zone', 'Madrid no es su zona');
select pg_temp.assert((select owner_id is null from public.account where name = 'Sala Gran Vía'), 'fuera de zona no reserva');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'abababab-0000-4000-8000-000000000002';
select pg_temp.assert(public.account_touch('30000000-0000-4000-8000-000000000002', 'claim') = 'eligible', 'en su zona sí');
reset role;

reset request.jwt.claim.sub;
-- ---- la reserva caduca
update public.account set claimed_until = now() - interval '1 day' where name = 'Bar Nuevo';
update public.account_rules set strict_zones = false;
set role authenticated;
set request.jwt.claim.sub = 'abababab-0000-4000-8000-000000000002';
select pg_temp.assert(public.account_touch((select id from public.account where name = 'Bar Nuevo'), 'contact') = 'eligible', 'reserva caducada: libre');
select pg_temp.assert((select owner_id = 'abababab-0000-4000-8000-000000000002' from public.account where name = 'Bar Nuevo'), 'pasa a quien la trabaja ahora');
reset role;

-- ---- vista previa para la app
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(public.account_eligibility_preview((select id from public.account where name = 'Bar Nuevo')) = 'claimed_by_other', 'vista previa: ya no es suya');
reset role;

-- ---- el colaborador no ve el CRM
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select pg_temp.assert((select count(*) from public.account) = 0, 'colaborador: sin cuentas del CRM');
select pg_temp.assert((select count(*) from public.zone) = 0, 'colaborador: sin zonas');
do $$ begin
  perform public.account_eligibility_preview('30000000-0000-4000-8000-000000000001');
  raise exception 'ASSERT FAILED: colaborador consulta el CRM';
exception when insufficient_privilege then null; end $$;
reset role;

delete from public.dossier where id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002');
delete from public.account where tenant_id = '00000000-0000-4000-8000-000000000e01';
delete from public.zone where tenant_id = '00000000-0000-4000-8000-000000000e01';
delete from public.account_rules;
delete from auth.users where email = 'rep2@enjoy.test';
delete from public.notification;
