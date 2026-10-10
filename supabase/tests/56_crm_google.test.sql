-- Google bien hecho (docs/CRM_DINAMICO.md §15): «Es este» rellena huecos (también redes, email y ciudad), guarda la
-- valoración y la foto, y la ciudad solo si es una zona del mismo espacio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.zone (id, tenant_id, name, kind) values ('56000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'Ciudad 56', 'city');
insert into public.account (id, tenant_id, name, instagram) values
  ('56000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Empresa 56', 'https://www.instagram.com/a_mano/'),
  ('56000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Empresa 56 bis', null);

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy (empresas libres)
select public.account_research('56000000-0000-4000-8000-0000000000a1', '{"placeId":"p56","phone":"+34 600","rating":4.46,"reviews":312,"photo":"places/p56/photos/f1",
  "zoneId":"56000000-0000-4000-8000-0000000000b1","email":"Hola@Local.test","instagram":"https://www.instagram.com/de_la_web/","facebook":"https://www.facebook.com/local56","linkedin":"https://www.linkedin.com/company/local56"}');
select pg_temp.assert((select zone_id = '56000000-0000-4000-8000-0000000000b1' and place_rating = 4.5 and place_reviews = 312 and place_photo = 'places/p56/photos/f1'
  and email = 'hola@local.test' and facebook = 'https://www.facebook.com/local56' and linkedin = 'https://www.linkedin.com/company/local56'
  from public.account where id = '56000000-0000-4000-8000-0000000000a1'), 'ciudad, valoración, foto, email y redes');
select pg_temp.assert((select instagram = 'https://www.instagram.com/a_mano/' and owner_id is null from public.account where id = '56000000-0000-4000-8000-0000000000a1'), 'no pisa lo escrito a mano ni la reserva');

-- Una ciudad de otro espacio no se pone (se ignora, el resto sí).
reset role;
insert into public.zone (id, tenant_id, name, kind) select '56000000-0000-4000-8000-0000000000b9', id, 'Ciudad ajena', 'city' from public.tenant where id <> '00000000-0000-4000-8000-000000000e01' limit 1;
set role authenticated;
select public.account_research('56000000-0000-4000-8000-0000000000a2', '{"placeId":"p57","zoneId":"56000000-0000-4000-8000-0000000000b9","rating":9}');
select pg_temp.assert((select zone_id is null and place_rating is null and place_id = 'p57' from public.account where id = '56000000-0000-4000-8000-0000000000a2'), 'ni zona ajena ni valoración imposible');

reset role;
delete from public.account where id in ('56000000-0000-4000-8000-0000000000a1', '56000000-0000-4000-8000-0000000000a2');
delete from public.zone where id in ('56000000-0000-4000-8000-0000000000b1', '56000000-0000-4000-8000-0000000000b9');
