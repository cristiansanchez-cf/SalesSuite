-- Propuestas que se vinculan solas a su empresa por el nombre (migración 20270114).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

select pg_temp.assert(public.company_key('Zafiro Zone, S.L.') = 'zafiro zone', 'clave: sin signos ni S.L.');
select pg_temp.assert(public.company_key('  CAFÉ   Málaga ') = 'cafe malaga', 'clave: sin tildes ni mayúsculas');
select pg_temp.assert(public.company_key('--') is null, 'clave vacía');

insert into auth.users (id, email) values ('93939393-0000-4000-8000-000000000001', 'rep93@test');
insert into public.membership (user_id, tenant_id, role) values ('93939393-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep');
insert into public.account (id, tenant_id, name) values
  ('93939393-aaaa-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Zafiro Zone 93'),
  ('93939393-aaaa-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'Doble 93'),
  ('93939393-aaaa-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', 'DOBLE 93, S.L.');

set role authenticated;
set request.jwt.claim.sub = '93939393-0000-4000-8000-000000000001';
insert into public.dossier (id, tenant_id, author_id, title, prospect_company, price_mode) values
  ('93939393-dddd-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '93939393-0000-4000-8000-000000000001', 'P1', 'zafiro zone 93', 'none'),
  ('93939393-dddd-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', '93939393-0000-4000-8000-000000000001', 'P2', 'Doble 93', 'none'),
  ('93939393-dddd-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', '93939393-0000-4000-8000-000000000001', 'P3', 'Otra 93', 'none');
reset role;
select pg_temp.assert((select account_id = '93939393-aaaa-4000-8000-000000000001' from public.dossier where id = '93939393-dddd-4000-8000-000000000001'), 'nueva: se vincula por el nombre');
select pg_temp.assert((select count(*) = 1 from public.account_touch where account_id = '93939393-aaaa-4000-8000-000000000001' and kind = 'dossier'), 'nueva: cuenta como contacto (como elegirla)');
select pg_temp.assert((select owner_id = '93939393-0000-4000-8000-000000000001' from public.account where id = '93939393-aaaa-4000-8000-000000000001'), 'nueva: reserva la empresa libre');
select pg_temp.assert((select account_id is null from public.dossier where id = '93939393-dddd-4000-8000-000000000002'), 'dos con ese nombre: no adivina');
select pg_temp.assert((select account_id is null from public.dossier where id = '93939393-dddd-4000-8000-000000000003'), 'sin empresa con ese nombre: sin vincular');

-- Cambiar el nombre a uno que existe: se vincula, sin contacto ni reserva.
insert into public.account (id, tenant_id, name) values ('93939393-aaaa-4000-8000-000000000004', '00000000-0000-4000-8000-000000000e01', 'Nueva 93');
set role authenticated;
update public.dossier set prospect_company = 'Nueva 93' where id = '93939393-dddd-4000-8000-000000000003';
reset role;
select pg_temp.assert((select account_id = '93939393-aaaa-4000-8000-000000000004' from public.dossier where id = '93939393-dddd-4000-8000-000000000003'), 'cambiar el nombre: se vincula');
select pg_temp.assert((select count(*) = 0 from public.account_touch where account_id = '93939393-aaaa-4000-8000-000000000004' and kind = 'dossier'), 'cambiar el nombre: sin contacto ni reserva');
