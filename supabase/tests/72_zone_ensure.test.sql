-- Migración 20261203: un comercial da de alta una empresa en cualquier ciudad y su zona se crea sola (§44).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
-- De otro espacio: no.
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  perform public.zone_ensure('00000000-0000-4000-8000-000000000e01', '[{"name":"Corea 72","kind":"country"}]');
  raise exception 'ASSERT FAILED: alguien de otro espacio crea zonas';
exception when insufficient_privilege then null; end $$;

-- El comercial: crea la ruta entera; la segunda vez reutiliza (sin mirar mayúsculas).
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.zone_ensure('00000000-0000-4000-8000-000000000e01', '[{"name":"Corea 72","kind":"country"},{"name":"Busan 72","kind":"city"}]') as busan \gset
select pg_temp.assert(public.zone_ensure('00000000-0000-4000-8000-000000000e01', '[{"name":"corea 72","kind":"country"},{"name":"BUSAN 72","kind":"city"}]') = :'busan', 'reutiliza');
do $$ begin
  perform public.zone_ensure('00000000-0000-4000-8000-000000000e01', '[{"name":"X","kind":"planeta"}]');
  raise exception 'ASSERT FAILED: tipo de zona raro';
exception when check_violation then null; end $$;
do $$ begin
  perform public.zone_ensure('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: ruta vacía';
exception when check_violation then null; end $$;
reset role;
select pg_temp.assert((select count(*) = 2 from public.zone where name in ('Corea 72', 'Busan 72')), 'dos zonas, sin repetir');
select pg_temp.assert((select z.kind = 'city' and p.name = 'Corea 72' from public.zone z join public.zone p on p.id = z.parent_id where z.id = :'busan'), 'Busan dentro de Corea');
-- El comercial sigue sin poder tocar zonas a mano (solo esta ruta).
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  insert into public.zone (tenant_id, name) values ('00000000-0000-4000-8000-000000000e01', 'A mano 72');
  raise exception 'ASSERT FAILED: el comercial inserta zonas directamente';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.zone where name = 'Corea 72';
\echo '72_zone_ensure OK'
